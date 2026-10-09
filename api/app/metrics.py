"""Low-cardinality Prometheus metrics for HTTP traffic and application health."""

import time

from fastapi import Request
from prometheus_client import REGISTRY, Counter, Gauge, Histogram
from prometheus_client.core import GaugeMetricFamily

HTTP_REQUESTS = Counter(
    "kori_http_requests_total",
    "HTTP requests processed by the Kori API.",
    ("method", "route", "status"),
)
HTTP_DURATION = Histogram(
    "kori_http_request_duration_seconds",
    "HTTP request latency by stable route template.",
    ("method", "route"),
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
HTTP_IN_FLIGHT = Gauge("kori_http_requests_in_flight", "Requests currently being processed.")
GRAFANA_NOTIFICATIONS = Counter(
    "kori_grafana_notifications_total",
    "Grafana alert webhook notifications accepted by state and severity.",
    ("state", "severity"),
)
SECURITY_REJECTIONS = Counter(
    "kori_security_rejections_total",
    "Requests rejected at a security boundary.",
    ("reason",),
)
AUTH_FAILURES = Counter(
    "kori_auth_failures_total",
    "Authentication failures by bounded surface and reason.",
    ("surface", "reason"),
)
RATE_LIMIT_REJECTIONS = Counter(
    "kori_rate_limit_rejections_total",
    "Requests rejected by bounded quota type.",
    ("limit",),
)


class MaintenanceCollector:
    """Expose last-success time and last-run failure for every recorded maintenance job.

    Computed from ``MaintenanceRun`` at scrape time (cached briefly) so jobs running in other
    processes, including the backup runner, are visible without a push gateway.
    """

    _cache: tuple[float, list[tuple[str, float | None, bool]]] = (0.0, [])
    CACHE_SECONDS = 20

    def _rows(self) -> list[tuple[str, float | None, bool]]:
        now = time.monotonic()
        if now - self._cache[0] < self.CACHE_SECONDS:
            return self._cache[1]
        from sqlalchemy import text

        from app.database import SessionLocal

        try:
            with SessionLocal() as session:
                found = session.execute(
                    text(
                        'SELECT "jobName", '
                        "extract(epoch FROM max(\"finishedAt\") "
                        "FILTER (WHERE status = 'succeeded')), "
                        "(array_agg(status ORDER BY \"startedAt\" DESC))[1] = 'failed' "
                        'FROM "MaintenanceRun" GROUP BY "jobName"'
                    )
                ).all()
        except Exception:  # noqa: BLE001 - metrics must never break the scrape
            return []
        rows = [
            (name, float(ts) if ts is not None else None, bool(failed))
            for name, ts, failed in found
        ]
        MaintenanceCollector._cache = (now, rows)
        return rows

    def collect(self):
        success = GaugeMetricFamily(
            "kori_maintenance_last_success_timestamp_seconds",
            "Unix time of the last successful run of each maintenance job.",
            labels=["job"],
        )
        failed = GaugeMetricFamily(
            "kori_maintenance_last_run_failed",
            "1 when the most recent run of a maintenance job failed.",
            labels=["job"],
        )
        for name, timestamp, last_failed in self._rows():
            if timestamp is not None:
                success.add_metric([name], timestamp)
            failed.add_metric([name], 1.0 if last_failed else 0.0)
        yield success
        yield failed


REGISTRY.register(MaintenanceCollector())


async def metrics_middleware(request: Request, call_next):
    """Measure requests without using raw URLs as unbounded metric labels."""

    if request.url.path == "/metrics":
        return await call_next(request)

    started = time.perf_counter()
    HTTP_IN_FLIGHT.inc()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        route = request.scope.get("route")
        route_label = getattr(route, "path", None) or "unmatched"
        method = request.method
        HTTP_IN_FLIGHT.dec()
        HTTP_REQUESTS.labels(method, route_label, str(status_code)).inc()
        HTTP_DURATION.labels(method, route_label).observe(time.perf_counter() - started)
