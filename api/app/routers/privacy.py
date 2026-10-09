"""Privacy operations: consent records, data export, and account deletion."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import (
    ApiKey,
    ConsentRecord,
    DeveloperAccount,
    DeveloperSession,
    Sighting,
    Trip,
    UploadIntent,
)
from app.routers.developer import get_current_account
from app.schemas import ApiModel
from app.services import throttle
from app.services.audit import record_event
from app.services.identity import delete_provider_user

POLICY_VERSION = "2026-09-19"
ANONYMISED_NAME = "Deleted account"

consent_router = APIRouter(prefix="/api/privacy", tags=["Privacy"])
account_router = APIRouter(prefix="/api/developer", tags=["Privacy"])


class ConsentCreate(ApiModel):
    choice: str = Field(pattern="^(necessary|optional)$")
    policy_version: str = Field(
        validation_alias="policyVersion", serialization_alias="policyVersion", max_length=20
    )
    visitor_id: str = Field(
        validation_alias="visitorId", serialization_alias="visitorId", min_length=16, max_length=64
    )
    source: str = Field(default="marketing", max_length=24)

    @field_validator("visitor_id")
    @classmethod
    def opaque_id(cls, value: str) -> str:
        if not all(char.isalnum() or char in "-_" for char in value):
            raise ValueError("visitorId must be an opaque token")
        return value


class DeleteAccount(ApiModel):
    confirm_email: str = Field(validation_alias="confirmEmail", serialization_alias="confirmEmail")


@consent_router.post("/consent", status_code=status.HTTP_204_NO_CONTENT)
def record_consent(
    payload: ConsentCreate,
    request: Request,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    """Store a visitor's choice. No address, agent string, or account is recorded."""

    throttle.enforce(
        session, "consent", throttle.client_ip(request, settings), limit=30, window_seconds=3600
    )
    session.add(
        ConsentRecord(
            visitor_id=payload.visitor_id,
            choice=payload.choice,
            policy_version=payload.policy_version,
            source=payload.source,
        )
    )
    session.commit()


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


@account_router.get("/export")
def export_my_data(
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
) -> Response:
    """Everything Kori holds about the signed-in account, as a downloadable JSON file.

    Credential secrets are never included: keys are stored as one-way digests.
    """

    keys = session.scalars(select(ApiKey).where(ApiKey.account_id == account.id))
    sightings = session.scalars(
        select(Sighting)
        .where(Sighting.observer_id == account.id)
        .execution_options(include_deleted=True)
    )
    trips = session.scalars(select(Trip).where(Trip.account_id == account.id))
    uploads = session.scalars(select(UploadIntent).where(UploadIntent.account_id == account.id))
    payload = {
        "exportedAt": datetime.now(UTC).isoformat(),
        "policyVersion": POLICY_VERSION,
        "account": {
            "publicId": str(account.public_id),
            "email": account.email,
            "displayName": account.display_name,
            "role": account.role,
            "signInMethod": account.auth_provider,
            "createdAt": _iso(account.created_at),
        },
        "apiKeys": [
            {
                "name": key.name,
                "prefix": key.prefix,
                "scopes": key.scope_list,
                "createdAt": _iso(key.created_at),
                "expiresAt": _iso(key.expires_at),
                "revokedAt": _iso(key.revoked_at),
                "lastUsedAt": _iso(key.last_used_at),
            }
            for key in keys
        ],
        "sightings": [
            {
                "publicId": str(item.public_id),
                "species": item.species_id,
                "count": item.count,
                "seenAt": _iso(item.seen_at),
                "point": {"lon": item.lon, "lat": item.lat, "accuracyM": item.accuracy_m},
                "status": item.status,
                "notes": item.notes,
            }
            for item in sightings
        ],
        "trips": [
            {
                "publicId": str(item.public_id),
                "startedAt": _iso(item.started_at),
                "endedAt": _iso(item.ended_at),
                "trace": item.trace,
                "expiresAt": _iso(item.expires_at),
            }
            for item in trips
        ],
        "uploads": [
            {
                "purpose": item.purpose,
                "contentType": item.content_type,
                "sizeBytes": item.size_bytes,
                "status": item.status,
                "createdAt": _iso(item.created_at),
            }
            for item in uploads
        ],
    }
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="kori-my-data.json"'},
    )


@account_router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    payload: DeleteAccount,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    """Anonymise the account now; the row itself is purged after the grace period.

    Personal data leaves immediately (email, name, credentials, sessions, keys, uploads, trips).
    Approved sightings stay, detached from the person; sightings still waiting for review go.
    """

    if payload.confirm_email.strip().lower() != account.email:
        raise HTTPException(status_code=422, detail="Type your email address to confirm deletion")
    if account.role == "admin":
        raise HTTPException(
            status_code=409, detail="Administrators must be demoted before deleting an account"
        )
    subject = account.external_subject
    now = datetime.now(UTC)
    account_id = account.id

    provider_removed = True
    if subject:
        provider_removed = delete_provider_user(settings, subject)

    account.email = f"deleted-{account.public_id}@deleted.invalid"
    account.display_name = ANONYMISED_NAME
    account.password_hash = "!deleted"
    account.role = "deleted"
    # The provider user is gone, so this ID no longer identifies anyone. It stays on the row so
    # a token issued before deletion is refused as disabled instead of creating a new account.
    # The purge job removes it with the row.
    account.disabled_at = now
    account.deleted_at = now

    session.query(DeveloperSession).filter(DeveloperSession.account_id == account_id).delete()
    for key in session.scalars(select(ApiKey).where(ApiKey.account_id == account_id)):
        key.revoked_at = key.revoked_at or now
    # Trips are GPS traces: personal data, so they go now, not after the grace period.
    session.query(Trip).filter(Trip.account_id == account_id).delete()
    for item in session.scalars(select(Sighting).where(Sighting.observer_id == account_id)):
        item.observer_id = None
        if item.status == "pending":
            item.status = "rejected"
            item.deleted_at = now
    for upload in session.scalars(
        select(UploadIntent).where(UploadIntent.account_id == account_id)
    ):
        if upload.status != "deleted":
            upload.status = "rejected"  # the cleanup job removes the stored object
    record_event(
        session,
        None,
        "account.delete",
        "account",
        account_id,
        providerRemoved=provider_removed,
        graceDays=settings.deleted_account_grace_days,
    )
    session.commit()
