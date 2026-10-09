# Observability

How Kori's backend reports on itself, and exactly how much of it is wired today. The pieces came
from the owner's earlier platform (see `PROVENANCE.md`) and were renamed for Kori.

**State on 9 October 2026:** the configuration is in the repository and `docker compose config`
accepts it, but **none of it has been run for Kori**: the Docker daemon was not running on the
build machine, so no container was started, no metric was scraped and no dashboard was opened.

## What is in the repository

| Piece | Where | What it does |
| --- | --- | --- |
| API metrics | `api/app/metrics.py`, served at `/metrics/` | Request count and latency by route template, requests in flight, auth failures, rate-limit and security rejections, Grafana notifications received, and the last success and failure of each maintenance job. All prefixed `kori_`. |
| API traces | `api/app/telemetry.py` | OpenTelemetry for FastAPI, SQLAlchemy and outgoing HTTP, exported over OTLP gRPC when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; off otherwise. |
| Request IDs | `api/app/request_context.py` | Every response carries a request ID; the audit log stores it, so an audit event can be traced to its request. |
| Prometheus | `observability/prometheus/` | Scrapes `kori-api` (`api:8000/metrics/`), `kori-postgres` (the exporter) and Grafana. 13 alert rules in `alerts.yml`. |
| Grafana | `observability/grafana/` | Provisioned data sources (Prometheus, Tempo), the `kori-platform` dashboard, alert rules and a contact point that posts to the API's `/api/admin/observability/grafana-webhook`. |
| Tempo | `observability/tempo/tempo.yaml` | Receives the API's traces. |
| Postgres exporter | `compose.yaml` (`postgres-exporter`) | Database size, connections and cache hit rate for the `kori` database. |
| Operations view | `api/app/routers/admin.py` | Administrators read headline numbers through the API, which queries Prometheus. The review console does not show them yet. |

Start it locally with `docker compose up` from the repository root; Prometheus is on
<http://localhost:9090> and Grafana on <http://localhost:3004>.

## What is wired, and what is not

| | State |
| --- | --- |
| Metrics, tracing and request-ID code in the API | In the code and covered by the inherited tests (`pytest` passes). Not yet scraped from a running Kori API. |
| Prometheus, Grafana, Tempo and alert configuration | Valid compose configuration; never started for Kori. |
| Kori-specific metrics (sightings submitted, review queue length, trips shared) | **Not built.** The current metrics are the platform's. Next step: counters in the sightings, review and trips routers, and a queue-length gauge. |
| Alert receivers | The contact point posts to the API only. No email, SMS or chat receiver is configured; that needs the owner's choice of channel. |
| Web apps | **No telemetry.** The field app runs offline and sends nothing anywhere; any future client telemetry must be opt-in and must never include a position. |
| Hosted monitoring | None. The Vercel deployments have only Vercel's own logs. |

## Privacy rules for telemetry

- Metrics are labelled by route template (`/api/sightings/{id}`), never by the concrete path, so
  identifiers never reach Prometheus.
- No metric label carries a coordinate, a species at a place, or a trip. Request bodies are not
  logged. Traces record SQL statements with placeholders rather than values (the instrumentation's
  default); confirm this on the first real run before traces are kept anywhere shared.
- Traces are sampled (10% by default) and Tempo keeps them for 7 days. The audit log, not the
  tracing system, is the record of who did what.
