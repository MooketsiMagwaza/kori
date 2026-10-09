"""Database-backed sliding-window throttle shared by every API replica.

Sign-in, registration, recovery, and reporting are limited per source address and per target
identity. Identities are stored as keyed digests, never as raw emails or addresses.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.metrics import RATE_LIMIT_REJECTIONS
from app.models import AuthAttempt
from app.services.security import hash_token


def client_ip(request: Request, settings: Settings) -> str:
    """Return the caller address, trusting only the configured number of proxy hops."""

    hops = settings.trusted_proxy_hops
    forwarded = request.headers.get("x-forwarded-for", "")
    if hops > 0 and forwarded:
        parts = [part.strip() for part in forwarded.split(",") if part.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


def enforce(
    session: Session,
    scope: str,
    identity: str,
    *,
    limit: int,
    window_seconds: int,
) -> None:
    """Count one attempt; raise 429 with an accurate Retry-After once ``limit`` is exceeded."""

    now = datetime.now(UTC)
    digest = hash_token(f"{scope}:{identity.strip().lower()}")
    cutoff = now - timedelta(seconds=window_seconds)
    count, oldest = session.execute(
        select(func.count(AuthAttempt.id), func.min(AuthAttempt.occurred_at)).where(
            AuthAttempt.scope == scope,
            AuthAttempt.identity_hash == digest,
            AuthAttempt.occurred_at >= cutoff,
        )
    ).one()
    if count >= limit:
        RATE_LIMIT_REJECTIONS.labels(f"auth_{scope}"[:24]).inc()
        oldest = oldest if oldest is not None else now
        if oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=UTC)
        wait = max(1, int((oldest + timedelta(seconds=window_seconds) - now).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait before trying again.",
            headers={"Retry-After": str(wait)},
        )
    session.add(AuthAttempt(scope=scope, identity_hash=digest, occurred_at=now))
    session.commit()


def prune(session: Session, older_than: timedelta = timedelta(days=2)) -> int:
    """Delete attempts that no window can still reference; returns rows removed."""

    removed = session.execute(
        delete(AuthAttempt).where(AuthAttempt.occurred_at < datetime.now(UTC) - older_than)
    ).rowcount
    return removed or 0
