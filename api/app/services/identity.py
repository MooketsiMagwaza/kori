"""Verification of identity-provider access tokens and mapping to Kori accounts.

Tokens are verified locally: signature, issuer, audience, and expiry are all required, the
algorithm is fixed by the configured key type (never taken from the token), and an unsigned
or ``none`` token is always rejected. The immutable ``sub`` claim identifies the account.
Authorization (role, disabled state, ownership) is read from Kori's tables and never from
token claims, so a compromised or mis-scoped identity provider cannot grant admin access.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from urllib.parse import quote

import httpx
import jwt
from fastapi import HTTPException
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import DeveloperAccount, RevokedAuthSession

SYMMETRIC_ALGORITHMS = ("HS256",)
ASYMMETRIC_ALGORITHMS = ("RS256", "ES256")
ROLE_DEVELOPER = "developer"


class IdentityError(Exception):
    """The token is not acceptable; the message is safe to show to the caller."""


class IdentityUnavailable(Exception):
    """The verification keys could not be fetched; retrying later may succeed."""


@dataclass(frozen=True)
class VerifiedIdentity:
    subject: str
    email: str | None
    email_verified: bool
    provider: str
    display_name: str | None
    aal: str
    session_id: str | None
    expires_at: datetime


@dataclass(frozen=True)
class AuthContext:
    """How the current request was authenticated; consulted by role checks."""

    method: str  # "external" or "local"
    aal: str | None = None
    session_id: str | None = None


def looks_like_jwt(token: str) -> bool:
    return token.count(".") == 2 and token.startswith("eyJ")


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_keys=True, lifespan=300, timeout=5)


def verify_access_token(token: str, settings: Settings) -> VerifiedIdentity:
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as error:
        raise IdentityError("The sign-in token is malformed") from error

    if algorithm in SYMMETRIC_ALGORITHMS and settings.auth_jwt_secret:
        key: object = settings.auth_jwt_secret
    elif algorithm in ASYMMETRIC_ALGORITHMS and settings.auth_jwks_url:
        try:
            key = _jwks_client(settings.auth_jwks_url).get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientConnectionError as error:
            raise IdentityUnavailable("Identity keys are temporarily unavailable") from error
        except jwt.PyJWTError as error:
            raise IdentityError("The sign-in token was not signed by a trusted key") from error
    else:
        raise IdentityError("The sign-in token uses an unsupported algorithm")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience=settings.auth_audience,
            issuer=settings.auth_issuer,
            options={"require": ["exp", "sub", "iss", "aud"]},
            leeway=30,
        )
    except jwt.ExpiredSignatureError as error:
        raise IdentityError("Your session has expired") from error
    except jwt.PyJWTError as error:
        raise IdentityError("The sign-in token is not valid") from error

    subject = str(claims["sub"])
    if not subject or len(subject) > 64:
        raise IdentityError("The sign-in token is not valid")
    app_metadata = (
        claims.get("app_metadata") if isinstance(claims.get("app_metadata"), dict) else {}
    )
    user_metadata = (
        claims.get("user_metadata") if isinstance(claims.get("user_metadata"), dict) else {}
    )
    email = claims.get("email")
    name = (
        user_metadata.get("full_name")
        or user_metadata.get("name")
        or user_metadata.get("display_name")
    )
    return VerifiedIdentity(
        subject=subject,
        email=email.strip().lower() if isinstance(email, str) and email.strip() else None,
        email_verified=user_metadata.get("email_verified") is True,
        provider=str(app_metadata.get("provider") or "external")[:24],
        display_name=str(name).strip()[:120] if isinstance(name, str) and name.strip() else None,
        aal=str(claims.get("aal") or "aal1"),
        session_id=str(claims["session_id"])[:64] if claims.get("session_id") else None,
        expires_at=datetime.fromtimestamp(int(claims["exp"]), tz=UTC),
    )


def is_session_revoked(session: Session, session_id: str | None) -> bool:
    if not session_id:
        return False
    return session.get(RevokedAuthSession, session_id) is not None


def revoke_session(session: Session, identity: VerifiedIdentity) -> None:
    if identity.session_id and not is_session_revoked(session, identity.session_id):
        session.add(
            RevokedAuthSession(session_id=identity.session_id, expires_at=identity.expires_at)
        )
        session.commit()


def resolve_account(session: Session, identity: VerifiedIdentity) -> DeveloperAccount:
    """Return the account for a verified identity, linking or creating it safely."""

    # Deleted accounts keep their subject as a tombstone; look them up too, so a token issued
    # before deletion is refused below rather than colliding with (or recreating) the account.
    account = session.scalar(
        select(DeveloperAccount)
        .where(DeveloperAccount.external_subject == identity.subject)
        .execution_options(include_deleted=True)
    )
    if account is None:
        account = _link_or_create(session, identity)
    if account.disabled_at is not None:
        raise HTTPException(status_code=403, detail="This account has been disabled")
    return account


def _link_or_create(session: Session, identity: VerifiedIdentity) -> DeveloperAccount:
    if not identity.email:
        raise HTTPException(status_code=401, detail="The sign-in did not include an email address")
    existing = session.scalar(
        select(DeveloperAccount).where(DeveloperAccount.email == identity.email)
    )
    if existing is not None:
        # Never merge on an unverified email match; that would allow account takeover.
        if not identity.email_verified:
            raise HTTPException(
                status_code=409,
                detail="Verify your email address to link this sign-in to your existing account",
            )
        if existing.external_subject and existing.external_subject != identity.subject:
            raise HTTPException(status_code=409, detail="This email is linked to another sign-in")
        existing.external_subject = identity.subject
        existing.auth_provider = identity.provider
        session.commit()
        return existing

    account = DeveloperAccount(
        email=identity.email,
        display_name=identity.display_name or identity.email.split("@")[0][:120],
        password_hash="!external",  # unusable: this account signs in through the provider only
        role=ROLE_DEVELOPER,
        external_subject=identity.subject,
        auth_provider=identity.provider,
    )
    session.add(account)
    try:
        session.commit()
    except IntegrityError:
        # A concurrent first request created it; use that row.
        session.rollback()
        account = session.scalar(
            select(DeveloperAccount).where(DeveloperAccount.external_subject == identity.subject)
        )
        if account is None:
            raise
    return account


def delete_provider_user(settings: Settings, subject: str) -> bool:
    """Remove the identity-provider user so the person can no longer sign in anywhere.

    Returns ``True`` when there was nothing to remove or the provider confirmed removal, and
    ``False`` when it could not be reached (the purge job retries before the account row goes).
    """

    if not settings.external_auth_enabled or not settings.auth_jwt_secret:
        return True
    token = jwt.encode(
        {
            "role": "service_role",
            "aud": settings.auth_audience,
            "iss": settings.auth_issuer,
            "exp": int(datetime.now(UTC).timestamp()) + 60,
        },
        settings.auth_jwt_secret,
        algorithm="HS256",
    )
    base = (settings.auth_admin_url or settings.auth_issuer).rstrip("/")
    try:
        response = httpx.delete(
            f"{base}/admin/users/{quote(subject, safe='')}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
    except httpx.HTTPError:
        return False
    return response.status_code in (200, 204, 404)
