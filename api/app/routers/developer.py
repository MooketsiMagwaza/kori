"""Unified account, session, API-key, recovery, and usage endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.metrics import AUTH_FAILURES
from app.models import (
    ApiKey,
    ApiUsage,
    DeveloperAccount,
    DeveloperSession,
    PasswordResetToken,
)
from app.schemas import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyRead,
    DeveloperAccountRead,
    DeveloperAuthResponse,
    DeveloperLoginRequest,
    DeveloperRegisterRequest,
    PasswordRecoveryRequest,
    PasswordRecoveryResponse,
    PasswordResetRequest,
    UsageSummary,
)
from app.services import throttle  # noqa: E402  (kept beside the router that uses it)
from app.services.identity import (
    AuthContext,
    IdentityError,
    IdentityUnavailable,
    is_session_revoked,
    looks_like_jwt,
    resolve_account,
    revoke_session,
    verify_access_token,
)
from app.services.security import (
    hash_password,
    hash_token,
    issue_api_key,
    issue_password_reset_token,
    issue_session_token,
    key_prefix,
    verify_password,
)

router = APIRouter(prefix="/api/developer", tags=["Developer access"])


def account_read(account: DeveloperAccount) -> DeveloperAccountRead:
    return DeveloperAccountRead.model_validate(account)


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return authorization.removeprefix("Bearer ").strip()


def get_current_account(
    request: Request,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DeveloperAccount:
    """Authenticate a provider bearer token or, in development, a local session token."""

    token = _bearer_token(authorization)
    if settings.external_auth_enabled and looks_like_jwt(token):
        try:
            identity = verify_access_token(token, settings)
        except IdentityError as error:
            AUTH_FAILURES.labels("developer", "invalid_token").inc()
            raise HTTPException(status_code=401, detail=str(error)) from error
        except IdentityUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        if is_session_revoked(session, identity.session_id):
            AUTH_FAILURES.labels("developer", "revoked_session").inc()
            raise HTTPException(status_code=401, detail="Your session has ended")
        account = resolve_account(session, identity)
        request.state.auth = AuthContext("external", identity.aal, identity.session_id)
        return account

    if not settings.local_auth_enabled:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    developer_session = session.scalar(
        select(DeveloperSession).where(
            DeveloperSession.token_hash == hash_token(token),
            DeveloperSession.expires_at > datetime.now(UTC),
        )
    )
    if developer_session is None:
        raise HTTPException(status_code=401, detail="Your session has expired")
    if developer_session.account.disabled_at is not None:
        raise HTTPException(status_code=403, detail="This account has been disabled")
    request.state.auth = AuthContext("local")
    return developer_session.account


def _require_local_auth(settings: Settings) -> None:
    """Password sign-in is owned by the identity provider once local auth is switched off."""

    if not settings.local_auth_enabled:
        raise HTTPException(status_code=410, detail="Sign in with the identity provider instead")


@router.post("/register", response_model=DeveloperAuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    request: Request,
    payload: DeveloperRegisterRequest,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DeveloperAuthResponse:
    _require_local_auth(settings)
    throttle.enforce(
        session, "register", throttle.client_ip(request, settings), limit=10, window_seconds=3600
    )
    if session.scalar(select(DeveloperAccount).where(DeveloperAccount.email == payload.email)):
        raise HTTPException(status_code=409, detail="An account already exists for this email")
    account = DeveloperAccount(
        email=payload.email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )
    session.add(account)
    session.flush()
    raw_token = issue_session_token()
    session.add(
        DeveloperSession(
            account_id=account.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.developer_session_days),
        )
    )
    session.commit()
    session.refresh(account)
    return DeveloperAuthResponse(token=raw_token, account=account_read(account))


@router.post("/login", response_model=DeveloperAuthResponse)
def login(
    request: Request,
    payload: DeveloperLoginRequest,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DeveloperAuthResponse:
    _require_local_auth(settings)
    address = throttle.client_ip(request, settings)
    throttle.enforce(session, "login-ip", address, limit=60, window_seconds=900)
    # Per address and email together, so one attacker cannot lock a victim out from elsewhere.
    throttle.enforce(session, "login", f"{address}|{payload.email}", limit=10, window_seconds=900)
    account = session.scalar(
        select(DeveloperAccount).where(DeveloperAccount.email == payload.email.strip().lower())
    )
    if account is None or not verify_password(payload.password, account.password_hash):
        AUTH_FAILURES.labels("developer", "invalid_credentials").inc()
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    if account.disabled_at is not None:
        raise HTTPException(status_code=403, detail="This account has been disabled")
    raw_token = issue_session_token()
    session.add(
        DeveloperSession(
            account_id=account.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.developer_session_days),
        )
    )
    session.commit()
    return DeveloperAuthResponse(token=raw_token, account=account_read(account))


@router.get("/me", response_model=DeveloperAccountRead)
def me(account: DeveloperAccount = Depends(get_current_account)) -> DeveloperAccountRead:
    return account_read(account)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        return
    token = authorization.removeprefix("Bearer ").strip()
    if settings.external_auth_enabled and looks_like_jwt(token):
        try:
            revoke_session(session, verify_access_token(token, settings))
        except (IdentityError, IdentityUnavailable):
            return  # an invalid or expired token has nothing left to revoke
        return
    developer_session = session.scalar(
        select(DeveloperSession).where(DeveloperSession.token_hash == hash_token(token))
    )
    if developer_session is not None:
        session.delete(developer_session)
        session.commit()


@router.get("/keys", response_model=list[ApiKeyRead])
def list_keys(
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
) -> list[ApiKey]:
    return list(
        session.scalars(
            select(ApiKey).where(ApiKey.account_id == account.id).order_by(ApiKey.created_at.desc())
        )
    )


@router.post("/keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_key(
    payload: ApiKeyCreate,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ApiKeyCreated:
    raw_key = issue_api_key()
    api_key = ApiKey(
        account_id=account.id,
        name=payload.name.strip(),
        prefix=key_prefix(raw_key),
        secret_hash=hash_token(raw_key),
        monthly_quota=settings.default_monthly_api_quota,
        hourly_limit=settings.default_hourly_api_limit,
        expires_at=datetime.now(UTC) + timedelta(days=settings.api_key_lifetime_days),
    )
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    return ApiKeyCreated(key=raw_key, **ApiKeyRead.model_validate(api_key).model_dump())


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_key(
    key_id: int,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
) -> None:
    api_key = session.scalar(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.account_id == account.id)
    )
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.revoked_at = datetime.now(UTC)
    session.commit()


@router.post("/keys/{key_id}/rotate", response_model=ApiKeyCreated)
def rotate_key(
    key_id: int,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ApiKeyCreated:
    """Replace an active credential and reveal the new secret exactly once."""

    previous_key = session.scalar(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.account_id == account.id)
    )
    if previous_key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if previous_key.revoked_at is not None:
        raise HTTPException(status_code=409, detail="A revoked API key cannot be rotated")

    raw_key = issue_api_key()
    replacement = ApiKey(
        account_id=account.id,
        name=previous_key.name,
        prefix=key_prefix(raw_key),
        secret_hash=hash_token(raw_key),
        monthly_quota=previous_key.monthly_quota,
        hourly_limit=previous_key.hourly_limit,
        expires_at=datetime.now(UTC) + timedelta(days=settings.api_key_lifetime_days),
        rotated_from_id=previous_key.id,
    )
    previous_key.revoked_at = datetime.now(UTC)
    session.add(replacement)
    session.commit()
    session.refresh(replacement)
    return ApiKeyCreated(key=raw_key, **ApiKeyRead.model_validate(replacement).model_dump())


@router.get("/usage", response_model=UsageSummary)
def usage(
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> UsageSummary:
    now = datetime.now(UTC)
    period_start = datetime(now.year, now.month, 1, tzinfo=UTC)
    keys = list(session.scalars(select(ApiKey).where(ApiKey.account_id == account.id)))
    key_ids = [api_key.id for api_key in keys]
    quota = sum(api_key.monthly_quota for api_key in keys if api_key.revoked_at is None)
    if not key_ids:
        return UsageSummary(
            used=0,
            quota=0,
            remaining=0,
            period_start=period_start,
            recent_paths={},
            estimated_cost_usd=0 if settings.estimated_cost_per_1000_requests_usd else None,
        )
    used = (
        session.scalar(
            select(func.count(ApiUsage.id)).where(
                ApiUsage.api_key_id.in_(key_ids), ApiUsage.occurred_at >= period_start
            )
        )
        or 0
    )
    path_rows = session.execute(
        select(ApiUsage.path, func.count(ApiUsage.id))
        .where(ApiUsage.api_key_id.in_(key_ids), ApiUsage.occurred_at >= period_start)
        .group_by(ApiUsage.path)
        .order_by(func.count(ApiUsage.id).desc())
        .limit(8)
    )
    return UsageSummary(
        used=used,
        quota=quota,
        remaining=max(0, quota - used),
        period_start=period_start,
        recent_paths={path: count for path, count in path_rows},
        estimated_cost_usd=(
            round(used / 1000 * settings.estimated_cost_per_1000_requests_usd, 4)
            if settings.estimated_cost_per_1000_requests_usd is not None
            else None
        ),
    )


@router.post("/password-recovery", response_model=PasswordRecoveryResponse)
def request_password_recovery(
    request: Request,
    payload: PasswordRecoveryRequest,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> PasswordRecoveryResponse:
    """Create a one-use recovery token while returning the same response for every email."""

    _require_local_auth(settings)
    address = throttle.client_ip(request, settings)
    throttle.enforce(session, "recover-ip", address, limit=10, window_seconds=3600)
    throttle.enforce(session, "recover", payload.email, limit=3, window_seconds=3600)
    account = session.scalar(
        select(DeveloperAccount).where(DeveloperAccount.email == payload.email)
    )
    debug_token = None
    if account is not None:
        raw_token = issue_password_reset_token()
        session.add(
            PasswordResetToken(
                account_id=account.id,
                token_hash=hash_token(raw_token),
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            )
        )
        session.commit()
        if settings.password_reset_debug:
            debug_token = raw_token
    return PasswordRecoveryResponse(
        message="If that account exists, a recovery link has been prepared.",
        debug_token=debug_token,
    )


@router.post("/password-reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    request: Request,
    payload: PasswordResetRequest,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    _require_local_auth(settings)
    throttle.enforce(
        session, "reset", throttle.client_ip(request, settings), limit=20, window_seconds=3600
    )
    now = datetime.now(UTC)
    reset = session.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(payload.token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    if reset is None:
        raise HTTPException(status_code=400, detail="This recovery link is invalid or expired")
    account = session.get(DeveloperAccount, reset.account_id)
    if account is None:
        raise HTTPException(status_code=400, detail="This recovery link is invalid or expired")
    account.password_hash = hash_password(payload.password)
    reset.used_at = now
    session.query(DeveloperSession).filter(DeveloperSession.account_id == account.id).delete()
    session.commit()
