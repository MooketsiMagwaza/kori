"""Deleted accounts stay deleted: old tokens are refused and the purge job finishes the provider."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.jobs import maintenance
from app.models import ApiKey, DeveloperAccount, DeveloperSession, Trip, Workspace
from app.services.identity import VerifiedIdentity, resolve_account

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)


@pytest.fixture
def session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    for model in (DeveloperAccount, DeveloperSession, Workspace, ApiKey, Trip):
        model.__table__.create(engine, checkfirst=True)
    with Session(engine, expire_on_commit=False) as db:
        yield db


def _deleted_account(subject: str | None, deleted_days_ago: int) -> DeveloperAccount:
    moment = NOW - timedelta(days=deleted_days_ago)
    return DeveloperAccount(
        email=f"deleted-{deleted_days_ago}-{subject}@deleted.invalid",
        display_name="Deleted account",
        password_hash="!deleted",
        role="deleted",
        external_subject=subject,
        disabled_at=moment,
        deleted_at=moment,
    )


def test_a_token_issued_before_deletion_cannot_recreate_the_account(session: Session) -> None:
    session.add(_deleted_account("sub-1", deleted_days_ago=1))
    session.commit()
    identity = VerifiedIdentity(
        subject="sub-1",
        email="observer@example.test",
        email_verified=True,
        provider="email",
        display_name="Observer One",
        aal="aal1",
        session_id="sess-1",
        expires_at=NOW + timedelta(hours=1),
    )

    with pytest.raises(HTTPException) as caught:
        resolve_account(session, identity)

    assert caught.value.status_code == 403
    everyone = select(func.count()).select_from(DeveloperAccount)
    assert session.scalar(everyone) == 0, "no live account was created"
    assert session.scalar(everyone.execution_options(include_deleted=True)) == 1


def test_the_purge_waits_for_the_provider_to_confirm_removal(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The account without a subject is a local-mode one: it has no provider user to remove.
    session.add_all(
        [
            _deleted_account("gone", deleted_days_ago=45),
            _deleted_account("stuck", deleted_days_ago=45),
            _deleted_account(None, deleted_days_ago=45),
            _deleted_account("recent", deleted_days_ago=2),
        ]
    )
    session.commit()
    asked: list[str] = []

    def provider(_settings, subject: str) -> bool:
        asked.append(subject)
        return subject != "stuck"

    monkeypatch.setattr(maintenance, "delete_provider_user", provider)

    purged, details = maintenance.purge_deleted_accounts(session, NOW)
    session.commit()

    assert (purged, details["deferred"]) == (2, 1)
    assert sorted(asked) == ["gone", "stuck"], "recent deletions are inside the grace period"
    remaining = session.scalars(
        select(DeveloperAccount.external_subject).execution_options(include_deleted=True)
    ).all()
    assert set(remaining) == {"stuck", "recent"}
