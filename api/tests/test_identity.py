"""External identity: token verification, account mapping, MFA gating, and production settings."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import DeveloperAccount
from app.routers.admin import require_admin
from app.services.identity import (
    AuthContext,
    IdentityError,
    VerifiedIdentity,
    looks_like_jwt,
    resolve_account,
    verify_access_token,
)

SECRET = "a-test-secret-that-is-comfortably-longer-than-32-bytes"
ISSUER = "http://auth.test"


def _settings(**overrides) -> Settings:
    values = {"auth_issuer": ISSUER, "auth_jwt_secret": SECRET, "auth_audience": "authenticated"}
    return Settings(_env_file=None, **{**values, **overrides})


def _token(secret: str = SECRET, algorithm: str = "HS256", **claims) -> str:
    payload = {
        "sub": "3f2c9d1e-0000-4000-8000-000000000001",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": datetime.now(UTC) + timedelta(hours=1),
        "email": "Observer@Example.test",
        "aal": "aal1",
        "session_id": "sess-1",
        "app_metadata": {"provider": "email"},
        "user_metadata": {"email_verified": True, "full_name": "Observer One"},
    }
    payload.update(claims)
    return jwt.encode(payload, secret, algorithm=algorithm)


def test_a_valid_token_yields_a_normalised_identity() -> None:
    identity = verify_access_token(_token(), _settings())

    assert identity.subject == "3f2c9d1e-0000-4000-8000-000000000001"
    assert identity.email == "observer@example.test"
    assert identity.email_verified is True
    assert identity.display_name == "Observer One"
    assert identity.aal == "aal1"
    assert identity.session_id == "sess-1"


@pytest.mark.parametrize(
    "token",
    [
        _token(exp=datetime.now(UTC) - timedelta(minutes=5)),
        _token(aud="someone-else"),
        _token(iss="http://evil.test"),
        _token(secret="a-different-secret-that-is-also-long-enough-to-sign"),
        jwt.encode({"sub": "x", "aud": "authenticated", "iss": ISSUER}, SECRET, algorithm="HS256"),
        "not-a-token",
    ],
    ids=["expired", "audience", "issuer", "signature", "no-exp", "malformed"],
)
def test_untrusted_tokens_are_rejected(token: str) -> None:
    with pytest.raises(IdentityError):
        verify_access_token(token, _settings())


def test_unsigned_tokens_are_rejected() -> None:
    unsigned = jwt.encode(
        {"sub": "x", "aud": "authenticated", "iss": ISSUER}, None, algorithm="none"
    )

    with pytest.raises(IdentityError):
        verify_access_token(unsigned, _settings())


def test_symmetric_tokens_are_refused_when_only_asymmetric_keys_are_configured() -> None:
    settings = _settings(auth_jwt_secret="", auth_jwks_url="http://auth.test/.well-known/jwks.json")

    with pytest.raises(IdentityError, match="unsupported algorithm"):
        verify_access_token(_token(), settings)


def test_jwt_detection_is_cheap_and_strict() -> None:
    assert looks_like_jwt(_token())
    assert not looks_like_jwt("kori_session_abc.def")
    assert not looks_like_jwt("kori_live_abcdef")


@pytest.fixture
def session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    DeveloperAccount.__table__.create(engine)
    with Session(engine, expire_on_commit=False) as db:
        yield db


def _identity(**overrides) -> VerifiedIdentity:
    values = {
        "subject": "sub-1",
        "email": "observer@example.test",
        "email_verified": True,
        "provider": "google",
        "display_name": "Observer One",
        "aal": "aal1",
        "session_id": "sess-1",
        "expires_at": datetime.now(UTC) + timedelta(hours=1),
    }
    return VerifiedIdentity(**{**values, **overrides})


def test_first_sign_in_creates_a_developer_account_only(session: Session) -> None:
    account = resolve_account(session, _identity())

    assert account.role == "developer"
    assert account.external_subject == "sub-1"
    assert account.password_hash == "!external"
    assert resolve_account(session, _identity()).id == account.id


def test_a_verified_email_links_an_existing_local_account(session: Session) -> None:
    existing = DeveloperAccount(
        email="observer@example.test", display_name="Old", password_hash="x", role="admin"
    )
    session.add(existing)
    session.commit()

    linked = resolve_account(session, _identity())

    assert linked.id == existing.id
    assert linked.role == "admin", "linking must not change an existing role"
    assert linked.external_subject == "sub-1"


def test_an_unverified_email_never_links_an_existing_account(session: Session) -> None:
    session.add(
        DeveloperAccount(email="observer@example.test", display_name="Old", password_hash="x")
    )
    session.commit()

    with pytest.raises(HTTPException) as caught:
        resolve_account(session, _identity(email_verified=False))

    assert caught.value.status_code == 409


def test_an_email_linked_to_another_subject_is_refused(session: Session) -> None:
    session.add(
        DeveloperAccount(
            email="observer@example.test",
            display_name="Old",
            password_hash="x",
            external_subject="someone-else",
        )
    )
    session.commit()

    with pytest.raises(HTTPException) as caught:
        resolve_account(session, _identity())

    assert caught.value.status_code == 409


def test_disabled_accounts_cannot_sign_in(session: Session) -> None:
    account = resolve_account(session, _identity())
    account.disabled_at = datetime.now(UTC)
    session.commit()

    with pytest.raises(HTTPException) as caught:
        resolve_account(session, _identity())

    assert caught.value.status_code == 403


def _request(context: AuthContext | None):
    return SimpleNamespace(state=SimpleNamespace(auth=context))


def test_operators_need_an_mfa_verified_provider_session() -> None:
    admin = SimpleNamespace(role="admin")
    strict = Settings(_env_file=None, operator_mfa_required=True)

    with pytest.raises(HTTPException) as weak:
        require_admin(_request(AuthContext("external", "aal1")), admin, strict)
    with pytest.raises(HTTPException) as local:
        require_admin(_request(AuthContext("local")), admin, strict)
    with pytest.raises(HTTPException) as missing:
        require_admin(_request(None), admin, strict)

    assert weak.value.status_code == local.value.status_code == missing.value.status_code == 403
    assert require_admin(_request(AuthContext("external", "aal2")), admin, strict) is admin


def test_non_admin_roles_are_rejected_before_mfa_is_considered() -> None:
    with pytest.raises(HTTPException) as caught:
        require_admin(
            _request(AuthContext("external", "aal2")),
            SimpleNamespace(role="developer"),
            Settings(_env_file=None),
        )

    assert caught.value.detail == "Administrator access is required"


def test_mfa_defaults_to_required_only_in_production() -> None:
    assert Settings(_env_file=None).mfa_required_for_operators is False
    assert Settings(_env_file=None, operator_mfa_required=True).mfa_required_for_operators is True


def test_production_requires_external_identity_and_disables_local_auth() -> None:
    production = {
        "deployment_environment": "production",
        "token_hash_secret": "a-real-production-secret-that-is-long-enough",
    }
    with pytest.raises(ValueError, match="LOCAL_AUTH_ENABLED"):
        Settings(_env_file=None, **production)
    with pytest.raises(ValueError, match="AUTH_ISSUER"):
        Settings(_env_file=None, local_auth_enabled=False, **production)

    ready = Settings(
        _env_file=None,
        local_auth_enabled=False,
        auth_issuer=ISSUER,
        auth_jwt_secret=SECRET,
        **production,
    )
    assert ready.external_auth_enabled and ready.mfa_required_for_operators


def test_short_jwt_secrets_are_rejected() -> None:
    with pytest.raises(ValueError, match="AUTH_JWT_SECRET"):
        Settings(_env_file=None, auth_issuer=ISSUER, auth_jwt_secret="too-short")
