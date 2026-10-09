"""Operational account, usage, and Grafana notification endpoints for the admin UI."""

import asyncio
import csv
import io
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.metrics import GRAFANA_NOTIFICATIONS
from app.models import (
    ApiKey,
    ApiUsage,
    DeveloperAccount,
    DeveloperSession,
    GrafanaNotification,
)
from app.routers.developer import get_current_account
from app.schemas import (
    AdminAccountRead,
    AdminOverviewResponse,
    AdminSystemMetrics,
    AdminUsagePathRead,
    GrafanaNotificationRead,
)

router = APIRouter(prefix="/api/admin", tags=["Admin operations"])


def require_admin(
    request: Request,
    account: DeveloperAccount = Depends(get_current_account),
    settings: Settings = Depends(get_settings),
) -> DeveloperAccount:
    """Enforce administrator role and operator MFA at the API boundary, not in the UI."""

    if account.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access is required")
    if settings.mfa_required_for_operators:
        context = getattr(request.state, "auth", None)
        # Fail closed: only an MFA-verified identity-provider session may operate the platform.
        if context is None or context.method != "external" or context.aal != "aal2":
            raise HTTPException(
                status_code=403,
                detail="Multi-factor authentication is required for administrator access",
            )
    return account


async def _prometheus_value(client: httpx.AsyncClient, base_url: str, query: str) -> float | None:
    response = await client.get(f"{base_url}/api/v1/query", params={"query": query})
    response.raise_for_status()
    payload = response.json()
    results = payload.get("data", {}).get("result", [])
    if not results:
        return None
    try:
        return float(results[0]["value"][1])
    except (KeyError, IndexError, TypeError, ValueError):
        return None


@router.get("/overview", response_model=AdminOverviewResponse)
def admin_overview(
    _: DeveloperAccount = Depends(require_admin), session: Session = Depends(get_db)
) -> AdminOverviewResponse:
    since = datetime.now(UTC) - timedelta(hours=24)
    paths = session.execute(
        select(ApiUsage.path, func.count(ApiUsage.id))
        .where(ApiUsage.occurred_at >= since)
        .group_by(ApiUsage.path)
        .order_by(func.count(ApiUsage.id).desc())
        .limit(6)
    ).all()
    settings = get_settings()
    return AdminOverviewResponse(
        accounts=session.scalar(select(func.count()).select_from(DeveloperAccount)) or 0,
        active_api_keys=session.scalar(
            select(func.count()).select_from(ApiKey).where(ApiKey.revoked_at.is_(None))
        )
        or 0,
        requests_24h=session.scalar(
            select(func.count()).select_from(ApiUsage).where(ApiUsage.occurred_at >= since)
        )
        or 0,
        firing_alerts=session.scalar(
            select(func.count())
            .select_from(GrafanaNotification)
            .where(GrafanaNotification.state == "firing")
        )
        or 0,
        usage_paths=[AdminUsagePathRead(path=path, requests=count) for path, count in paths],
        grafana_url=settings.grafana_public_url,
        prometheus_url=settings.prometheus_public_url,
    )


@router.get("/system", response_model=AdminSystemMetrics)
async def admin_system_metrics(_: DeveloperAccount = Depends(require_admin)) -> AdminSystemMetrics:
    settings = get_settings()
    queries = {
        "api_up": 'up{job="kori-api"}',
        "api_memory_bytes": 'process_resident_memory_bytes{job="kori-api"}',
        "api_cpu_cores": 'rate(process_cpu_seconds_total{job="kori-api"}[5m])',
        "api_open_fds": 'process_open_fds{job="kori-api"}',
        "request_p95_seconds": (
            "histogram_quantile(0.95, sum by (le) "
            "(rate(kori_http_request_duration_seconds_bucket[5m])))"
        ),
        "error_rate_percent": (
            '100 * sum(rate(kori_http_requests_total{status=~"5.."}[5m])) '
            "/ clamp_min(sum(rate(kori_http_requests_total[5m])), 0.001)"
        ),
        "database_up": 'pg_up{job="kori-postgres"}',
        "database_memory_bytes": 'pg_settings_shared_buffers_bytes{job="kori-postgres"}',
        "database_size_bytes": 'pg_database_size_bytes{job="kori-postgres",datname="kori"}',
        "database_connections": (
            'sum(pg_stat_database_numbackends{job="kori-postgres",datname="kori"})'
        ),
        "database_cache_hit_percent": (
            '100 * sum(rate(pg_stat_database_blks_hit{job="kori-postgres",'
            'datname="kori"}[5m])) / clamp_min(sum('
            'rate(pg_stat_database_blks_hit{job="kori-postgres",datname="kori"}[5m])'
            ' + rate(pg_stat_database_blks_read{job="kori-postgres",'
            'datname="kori"}[5m])), 0.001)'
        ),
    }
    values: dict[str, float | None] = {name: None for name in queries}
    reachable = False
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            responses = await asyncio.gather(
                *(
                    _prometheus_value(client, settings.prometheus_internal_url, query)
                    for query in queries.values()
                ),
                return_exceptions=True,
            )
        reachable = any(not isinstance(value, BaseException) for value in responses)
        for name, value in zip(queries, responses, strict=True):
            if not isinstance(value, BaseException):
                values[name] = value
    except httpx.HTTPError:
        pass

    return AdminSystemMetrics(
        api_up=None if values["api_up"] is None else values["api_up"] == 1,
        api_memory_bytes=values["api_memory_bytes"],
        api_cpu_cores=values["api_cpu_cores"],
        api_open_fds=values["api_open_fds"],
        request_p95_seconds=values["request_p95_seconds"],
        error_rate_percent=values["error_rate_percent"],
        database_up=(None if values["database_up"] is None else values["database_up"] == 1),
        database_memory_bytes=values["database_memory_bytes"],
        database_size_bytes=values["database_size_bytes"],
        database_connections=values["database_connections"],
        database_cache_hit_percent=values["database_cache_hit_percent"],
        prometheus_reachable=reachable,
        collected_at=datetime.now(UTC),
    )


@router.get("/accounts", response_model=list[AdminAccountRead])
def admin_accounts(
    limit: int = Query(default=50, ge=1, le=200),
    _: DeveloperAccount = Depends(require_admin),
    session: Session = Depends(get_db),
) -> list[AdminAccountRead]:
    key_count = (
        select(ApiKey.account_id.label("account_id"), func.count(ApiKey.id).label("key_count"))
        .group_by(ApiKey.account_id)
        .subquery()
    )
    active_key_count = (
        select(
            ApiKey.account_id.label("account_id"),
            func.count(ApiKey.id).label("active_key_count"),
        )
        .where(ApiKey.revoked_at.is_(None))
        .group_by(ApiKey.account_id)
        .subquery()
    )
    usage = (
        select(
            ApiKey.account_id.label("account_id"),
            func.count(ApiUsage.id).label("request_count"),
            func.max(ApiUsage.occurred_at).label("last_request_at"),
        )
        .join(ApiUsage, ApiUsage.api_key_id == ApiKey.id)
        .group_by(ApiKey.account_id)
        .subquery()
    )
    rows = session.execute(
        select(
            DeveloperAccount,
            func.coalesce(key_count.c.key_count, 0),
            func.coalesce(active_key_count.c.active_key_count, 0),
            func.coalesce(usage.c.request_count, 0),
            usage.c.last_request_at,
        )
        .outerjoin(key_count, key_count.c.account_id == DeveloperAccount.id)
        .outerjoin(active_key_count, active_key_count.c.account_id == DeveloperAccount.id)
        .outerjoin(usage, usage.c.account_id == DeveloperAccount.id)
        .order_by(DeveloperAccount.created_at.desc())
        .limit(limit)
    ).all()
    return [
        AdminAccountRead(
            id=account.id,
            email=account.email,
            display_name=account.display_name,
            created_at=account.created_at,
            api_key_count=keys,
            active_api_key_count=active_keys,
            request_count=requests,
            last_request_at=last_request,
        )
        for account, keys, active_keys, requests, last_request in rows
    ]


@router.get("/notifications", response_model=list[GrafanaNotificationRead])
def admin_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    _: DeveloperAccount = Depends(require_admin),
    session: Session = Depends(get_db),
) -> list[GrafanaNotificationRead]:
    return list(
        session.scalars(
            select(GrafanaNotification).order_by(GrafanaNotification.created_at.desc()).limit(limit)
        )
    )


@router.post("/observability/grafana-webhook", status_code=status.HTTP_202_ACCEPTED)
async def grafana_webhook(
    request: Request,
    secret: str = Query(min_length=8, max_length=200),
    session: Session = Depends(get_db),
) -> dict[str, bool]:
    settings = get_settings()
    if secret != settings.grafana_webhook_secret:
        raise HTTPException(status_code=401, detail="Invalid Grafana webhook secret")

    payload: Any = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Grafana payload must be an object")

    alerts = payload.get("alerts")
    if not isinstance(alerts, list) or not alerts:
        alerts = [payload]

    for item in alerts[:100]:
        if not isinstance(item, dict):
            continue
        labels = item.get("labels") if isinstance(item.get("labels"), dict) else {}
        annotations = item.get("annotations") if isinstance(item.get("annotations"), dict) else {}
        state = str(item.get("status") or payload.get("status") or "firing")[:30].lower()
        severity = str(labels.get("severity") or "warning")[:30].lower()
        title = str(
            annotations.get("summary")
            or labels.get("alertname")
            or payload.get("title")
            or "Grafana alert"
        )[:180]
        message = str(annotations.get("description") or payload.get("message") or "")[:2000]
        session.add(
            GrafanaNotification(
                fingerprint=str(item.get("fingerprint") or "")[:160] or None,
                state=state,
                severity=severity,
                title=title,
                message=message or None,
                dashboard_url=str(item.get("dashboardURL") or item.get("panelURL") or "")[:500]
                or None,
                payload=item,
            )
        )
        GRAFANA_NOTIFICATIONS.labels(state, severity).inc()
    session.commit()
    return {"accepted": True}


EXPORT_HEADER = ("occurredAt", "keyPrefix", "method", "path", "status", "latencyMs", "requestId")
EXPORT_ROW_LIMIT = 100_000


def _cell(value: object) -> object:
    """Neutralise spreadsheet formulas in exported text (CSV injection)."""

    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        return "'" + value
    return value


def _usage_csv(rows: list[tuple]) -> Iterator[str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_HEADER)
    yield buffer.getvalue()
    for occurred_at, prefix, method, path, status_code, latency_ms, request_id in rows:
        buffer.seek(0)
        buffer.truncate()
        writer.writerow(
            [
                _cell(value)
                for value in (
                    occurred_at.isoformat(),
                    prefix,
                    method,
                    path,
                    status_code,
                    latency_ms,
                    request_id,
                )
            ]
        )
        yield buffer.getvalue()


@router.get("/usage/export")
def export_usage(
    days: int = Query(default=30, ge=1, le=400),
    _: DeveloperAccount = Depends(require_admin),
    session: Session = Depends(get_db),
) -> StreamingResponse:
    """Audit export of admitted public-API requests; secrets are never included."""

    since = datetime.now(UTC) - timedelta(days=days)
    rows = session.execute(
        select(
            ApiUsage.occurred_at,
            ApiKey.prefix,
            ApiUsage.method,
            ApiUsage.path,
            ApiUsage.status_code,
            ApiUsage.latency_ms,
            ApiUsage.request_id,
        )
        .join(ApiKey, ApiKey.id == ApiUsage.api_key_id)
        .where(ApiUsage.occurred_at >= since)
        .order_by(ApiUsage.occurred_at.desc())
        .limit(EXPORT_ROW_LIMIT)
    ).all()
    return StreamingResponse(
        _usage_csv([tuple(row) for row in rows]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="kori-api-usage-{days}d.csv"'},
    )


@router.post("/accounts/{account_id}/disable", status_code=status.HTTP_204_NO_CONTENT)
def disable_account(
    account_id: int,
    admin: DeveloperAccount = Depends(require_admin),
    session: Session = Depends(get_db),
) -> None:
    """Block sign-in and API-key use for an account and end its local sessions."""

    if account_id == admin.id:
        raise HTTPException(status_code=409, detail="You cannot disable your own account")
    account = session.get(DeveloperAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    account.disabled_at = datetime.now(UTC)
    session.query(DeveloperSession).filter(DeveloperSession.account_id == account.id).delete()
    now = datetime.now(UTC)
    for key in session.scalars(
        select(ApiKey).where(ApiKey.account_id == account.id, ApiKey.revoked_at.is_(None))
    ):
        key.revoked_at = now
    session.commit()


@router.post("/accounts/{account_id}/enable", status_code=status.HTTP_204_NO_CONTENT)
def enable_account(
    account_id: int,
    _: DeveloperAccount = Depends(require_admin),
    session: Session = Depends(get_db),
) -> None:
    """Re-enable sign-in. Revoked API keys stay revoked; the owner issues new ones."""

    account = session.get(DeveloperAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    account.disabled_at = None
    session.commit()
