"""API, database and PostGIS health diagnostics."""

from datetime import UTC, datetime
from time import perf_counter

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api", tags=["Health"])
started_at = perf_counter()


@router.get("/health")
def health(session: Session = Depends(get_db)) -> dict[str, object]:
    checked_at = datetime.now(UTC).isoformat()
    started = perf_counter()
    services: dict[str, object] = {"api": {"status": "healthy"}}
    overall = "healthy"

    try:
        session.execute(text("SELECT 1"))
        latency = round((perf_counter() - started) * 1000)
        services["database"] = {"status": "healthy", "latencyMs": latency}
    except Exception:
        session.rollback()
        overall = "degraded"
        services["database"] = {"status": "degraded", "latencyMs": None}
        services["postgis"] = {"status": "degraded", "version": None}
        return {
            "status": overall,
            "checkedAt": checked_at,
            "uptimeSeconds": round(perf_counter() - started_at),
            "services": services,
        }

    for service_name, query in (("postgis", "SELECT PostGIS_Version()"),):
        try:
            version = session.execute(text(query)).scalar_one()
            services[service_name] = {"status": "healthy", "version": version}
        except Exception:
            session.rollback()
            overall = "degraded"
            services[service_name] = {"status": "degraded", "version": None}

    return {
        "status": overall,
        "checkedAt": checked_at,
        "uptimeSeconds": round(perf_counter() - started_at),
        "services": services,
    }
