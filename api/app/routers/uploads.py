"""Private uploads: signed intents, server-side verification, and short-lived download URLs."""

import base64
import re
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import DeveloperAccount, UploadIntent
from app.routers.developer import get_current_account
from app.schemas import ApiModel
from app.services.object_store import (
    MAX_URL_SECONDS,
    ObjectStoreDisabled,
    matches_declared_type,
    object_delete,
    object_head,
    object_prefix,
    presign,
)

router = APIRouter(prefix="/api/uploads", tags=["Private uploads"])

ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
PURPOSES = {"route_evidence", "profile"}
INTENT_LIFETIME = timedelta(minutes=10)


class UploadIntentCreate(ApiModel):
    purpose: str
    content_type: str = Field(validation_alias="contentType", serialization_alias="contentType")
    size_bytes: int = Field(validation_alias="sizeBytes", serialization_alias="sizeBytes", ge=1)
    sha256: str = Field(min_length=64, max_length=64)

    @field_validator("purpose")
    @classmethod
    def known_purpose(cls, value: str) -> str:
        if value not in PURPOSES:
            raise ValueError("Unknown upload purpose")
        return value

    @field_validator("content_type")
    @classmethod
    def allowed_type(cls, value: str) -> str:
        if value not in ALLOWED_TYPES:
            raise ValueError("Only JPEG, PNG, and WebP images are accepted")
        return value

    @field_validator("sha256")
    @classmethod
    def hex_digest(cls, value: str) -> str:
        if not re.fullmatch(r"[0-9a-f]{64}", value.lower()):
            raise ValueError("sha256 must be a 64-character hexadecimal digest")
        return value.lower()


class UploadIntentRead(ApiModel):
    id: int
    status: str
    upload_url: str = Field(serialization_alias="uploadUrl")
    method: str
    headers: dict[str, str]
    expires_at: datetime = Field(serialization_alias="expiresAt")


class UploadRead(ApiModel):
    id: int
    purpose: str
    content_type: str = Field(serialization_alias="contentType")
    size_bytes: int = Field(serialization_alias="sizeBytes")
    status: str
    created_at: datetime = Field(serialization_alias="createdAt")


class DownloadRead(ApiModel):
    url: str
    expires_at: datetime = Field(serialization_alias="expiresAt")


def _owned(session: Session, intent_id: int, account: DeveloperAccount) -> UploadIntent:
    intent = session.get(UploadIntent, intent_id)
    # Ownership is part of the lookup outcome: other accounts' intents look like they do not exist.
    if intent is None or (intent.account_id != account.id and account.role != "admin"):
        raise HTTPException(status_code=404, detail="Upload not found")
    return intent


def _b64_of_hex(digest: str) -> str:
    return base64.b64encode(bytes.fromhex(digest)).decode()


@router.post("/intents", response_model=UploadIntentRead, status_code=status.HTTP_201_CREATED)
def create_intent(
    payload: UploadIntentCreate,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> UploadIntentRead:
    if payload.size_bytes > settings.uploads_max_bytes:
        raise HTTPException(status_code=413, detail="That file is larger than the upload limit")
    today = datetime.now(UTC) - timedelta(hours=24)
    recent = session.scalar(
        select(func.count(UploadIntent.id)).where(
            UploadIntent.account_id == account.id, UploadIntent.created_at >= today
        )
    )
    if (recent or 0) >= settings.uploads_daily_intents:
        raise HTTPException(status_code=429, detail="Daily upload limit reached")

    # The key never contains user-supplied text: purpose/account/uuid only.
    key = f"{payload.purpose}/{account.id}/{uuid.uuid4().hex}.{ALLOWED_TYPES[payload.content_type]}"
    try:
        signed = presign(
            settings,
            "PUT",
            key,
            signed_headers={
                "content-type": payload.content_type,
                # A signed length makes the store refuse a body that differs from the declaration.
                "content-length": str(payload.size_bytes),
                "x-amz-checksum-sha256": _b64_of_hex(payload.sha256),
            },
        )
    except ObjectStoreDisabled as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    intent = UploadIntent(
        account_id=account.id,
        purpose=payload.purpose,
        object_key=key,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        sha256=payload.sha256,
        expires_at=signed.expires_at,
    )
    session.add(intent)
    session.commit()
    return UploadIntentRead(
        id=intent.id,
        status=intent.status,
        upload_url=signed.url,
        method=signed.method,
        headers=signed.headers,
        expires_at=signed.expires_at,
    )


@router.post("/intents/{intent_id}/complete", response_model=UploadRead)
def complete_intent(
    intent_id: int,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> UploadIntent:
    """Verify what was actually uploaded; anything that fails is deleted, not kept."""

    intent = _owned(session, intent_id, account)
    if intent.status != "pending":
        return intent
    reason = None
    try:
        head = object_head(settings, intent.object_key)
        if head is None:
            raise HTTPException(status_code=409, detail="The file has not been uploaded yet")
        size, _ = head
        if size != intent.size_bytes or size > settings.uploads_max_bytes:
            reason = "size"
        else:
            prefix = object_prefix(settings, intent.object_key)
            if prefix is None or not matches_declared_type(intent.content_type, prefix):
                reason = "content"
    except (httpx.HTTPError, ObjectStoreDisabled) as error:
        raise HTTPException(status_code=503, detail="Object storage is unavailable") from error
    if reason:
        try:
            object_delete(settings, intent.object_key)
        except httpx.HTTPError:
            pass  # the cleanup job retries rejected objects
        intent.status = "rejected"
        session.commit()
        raise HTTPException(
            status_code=422, detail="The uploaded file did not match what was declared"
        )
    intent.status = "verified"
    intent.verified_at = datetime.now(UTC)
    session.commit()
    return intent


@router.get("/{intent_id}/download", response_model=DownloadRead)
def download_url(
    intent_id: int,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DownloadRead:
    intent = _owned(session, intent_id, account)
    if intent.status != "verified":
        raise HTTPException(status_code=404, detail="Upload not found")
    try:
        signed = presign(settings, "GET", intent.object_key, expires_seconds=MAX_URL_SECONDS)
    except ObjectStoreDisabled as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return DownloadRead(url=signed.url, expires_at=signed.expires_at)
