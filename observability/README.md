# Observability

The local stack provisions Prometheus on port `9090` and Grafana on port `3004`.
Prometheus scrapes the FastAPI `/metrics/` endpoint every 15 seconds. Grafana loads
the provisioned Kori dashboard and forwards alert state changes to the API, where
they appear in the operations dashboard notification feed.

For local development Grafana allows anonymous read-only access. The administrator
login defaults to `admin` / `admin`; set `GRAFANA_ADMIN_PASSWORD` before using the
stack outside an isolated development machine. Set `GRAFANA_WEBHOOK_SECRET` to the
same private value for Grafana and the API in hosted environments.
