"""API-key authentication, scope checks, shared quota accounting, and final usage records.

Quotas are counted from the database, so every API replica enforces the same limits
without in-process state. A request is admitted (and counted) only after the key, its
scope, and both quotas pass; the final status and latency are written after the response
by :func:`finalize_usage`.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import SessionLocal, get_db
from app.metrics import AUTH_FAILURES, RATE_LIMIT_REJECTIONS
from app.models import ApiKey, ApiUsage
from app.services.rate_limit import invalid_credential_gate
from app.services.security import hash_token, key_prefix

API_VERSION = "v1"
SCOPE_SIGHTINGS_READ = "sightings:read"
SCOPE_SPECIES_READ = "species:read"
SCOPE_TRACKS_READ = "tracks:read"
KNOWN_SCOPES = frozenset({SCOPE_SIGHTINGS_READ, SCOPE_SPECIES_READ, SCOPE_TRACKS_READ})


@dataclass(frozen=True)
class QuotaSnapshot:
    """Hourly window and monthly balance reported to the caller in response headers."""

    hourly_limit: int
    hourly_remaining: int
    hourly_reset_at: datetime
    monthly_quota: int
    monthly_remaining: int

    def headers(self) -> dict[str, str]:
        return {
            "X-RateLimit-Limit": str(self.hourly_limit),
            "X-RateLimit-Remaining": str(max(0, self.hourly_remaining)),
            "X-RateLimit-Reset": str(int(self.hourly_reset_at.timestamp())),
            "X-Quota-Limit": str(self.monthly_quota),
            "X-Quota-Remaining": str(max(0, self.monthly_remaining)),
        }


def _retry_after_seconds(reset_at: datetime, now: datetime) -> str:
    return str(max(1, int((reset_at - now).total_seconds())))


def _authenticate(
    request: Request, x_api_key: str | None, session: Session, settings: Settings
) -> ApiKey:
    if not x_api_key:
        AUTH_FAILURES.labels("public_api", "missing_key").inc()
        raise HTTPException(status_code=401, detail="X-API-Key is required")
    client_host = request.client.host if request.client else "unknown"
    client_identity = f"ip:{client_host}"
    credential_identity = f"key:{hash_token(x_api_key)[:16]}"
    if any(
        invalid_credential_gate.blocked(identity, settings.invalid_key_attempts_per_hour)
        for identity in (client_identity, credential_identity)
    ):
        RATE_LIMIT_REJECTIONS.labels("invalid_credentials").inc()
        raise HTTPException(
            status_code=429,
            detail="Too many invalid credential attempts",
            headers={"Retry-After": "3600"},
        )
    api_key = session.scalar(
        select(ApiKey).where(
            ApiKey.prefix == key_prefix(x_api_key),
            ApiKey.secret_hash == hash_token(x_api_key),
            ApiKey.revoked_at.is_(None),
            ApiKey.expires_at > datetime.now(UTC),
        )
    )
    if api_key is None:
        invalid_credential_gate.record(client_identity)
        invalid_credential_gate.record(credential_identity)
        AUTH_FAILURES.labels("public_api", "invalid_key").inc()
        raise HTTPException(status_code=401, detail="API key is invalid, expired, or revoked")
    return api_key


def _charge_quota(request: Request, api_key: ApiKey, session: Session) -> QuotaSnapshot:
    """Admit one request, or raise 429 with a Retry-After that matches the real reset time."""

    now = datetime.now(UTC)
    period_start = datetime(now.year, now.month, 1, tzinfo=UTC)
    next_month = (period_start + timedelta(days=32)).replace(day=1)
    monthly_used = (
        session.scalar(
            select(func.count(ApiUsage.id)).where(
                ApiUsage.api_key_id == api_key.id, ApiUsage.occurred_at >= period_start
            )
        )
        or 0
    )
    window_start = now - timedelta(hours=1)
    hourly_used, oldest = session.execute(
        select(func.count(ApiUsage.id), func.min(ApiUsage.occurred_at)).where(
            ApiUsage.api_key_id == api_key.id, ApiUsage.occurred_at >= window_start
        )
    ).one()
    hourly_reset_at = (oldest or now) + timedelta(hours=1)
    snapshot = QuotaSnapshot(
        hourly_limit=api_key.hourly_limit,
        hourly_remaining=api_key.hourly_limit - hourly_used,
        hourly_reset_at=hourly_reset_at,
        monthly_quota=api_key.monthly_quota,
        monthly_remaining=api_key.monthly_quota - monthly_used,
    )
    if monthly_used >= api_key.monthly_quota:
        RATE_LIMIT_REJECTIONS.labels("monthly_quota").inc()
        raise HTTPException(
            status_code=429,
            detail="Monthly API quota exceeded",
            headers={**snapshot.headers(), "Retry-After": _retry_after_seconds(next_month, now)},
        )
    if hourly_used >= api_key.hourly_limit:
        RATE_LIMIT_REJECTIONS.labels("hourly_quota").inc()
        raise HTTPException(
            status_code=429,
            detail=f"Hourly API limit exceeded ({api_key.hourly_limit} requests)",
            headers={
                **snapshot.headers(),
                "Retry-After": _retry_after_seconds(hourly_reset_at, now),
            },
        )
    usage = ApiUsage(api_key_id=api_key.id, method=request.method, path=request.url.path)
    api_key.last_used_at = now
    session.add(usage)
    session.commit()
    request.state.api_usage_id = usage.id
    admitted = QuotaSnapshot(
        hourly_limit=snapshot.hourly_limit,
        hourly_remaining=snapshot.hourly_remaining - 1,
        hourly_reset_at=hourly_reset_at,
        monthly_quota=snapshot.monthly_quota,
        monthly_remaining=snapshot.monthly_remaining - 1,
    )
    request.state.quota = admitted
    return api_key


def require_scope(scope: str) -> Callable[..., ApiKey]:
    """Build a dependency that authenticates a key, checks ``scope``, and charges quota."""

    if scope not in KNOWN_SCOPES:
        raise ValueError(f"Unknown API scope: {scope}")

    def dependency(
        request: Request,
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
        session: Session = Depends(get_db),
        settings: Settings = Depends(get_settings),
    ) -> ApiKey:
        api_key = _authenticate(request, x_api_key, session, settings)
        if scope not in api_key.scope_list:
            AUTH_FAILURES.labels("public_api", "insufficient_scope").inc()
            raise HTTPException(status_code=403, detail=f"API key lacks the {scope} scope")
        return _charge_quota(request, api_key, session)

    return dependency


def finalize_usage(usage_id: int, status_code: int, latency_ms: int, request_id: str) -> None:
    """Record the outcome of an admitted request; failures must never affect the response."""

    try:
        with SessionLocal() as session:
            session.execute(
                update(ApiUsage)
                .where(ApiUsage.id == usage_id)
                .values(status_code=status_code, latency_ms=latency_ms, request_id=request_id[:64])
            )
            session.commit()
    except Exception:  # noqa: BLE001 - accounting is best effort after the response is built
        return
