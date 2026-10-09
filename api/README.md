# Kori API

FastAPI service, and the only application service allowed to read or write PostgreSQL. It owns
accounts and sessions, scoped API keys with quotas, throttling, the append-only audit log, private
uploads, privacy export and deletion, the review of sightings, shared trips, the track map and the
park-pack list.

**State:** scaffold. The code, migrations and unit tests run (`pytest`), but the service has not
been run against a live PostgreSQL database yet, and the web apps do not call it yet. See
`docs/WORK_ORDERS.md` (KO-08, KO-17).

## Run the checks

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # .venv/bin/python on Linux and macOS
.venv/Scripts/python -m ruff check app tests
.venv/Scripts/python -m pytest
```

Most tests run on in-memory SQLite. Positions are plain `lon` and `lat` columns, so the models work
there too; PostGIS geometry is added by migration `0013` as generated columns.

## Run it with the database

```sh
docker compose up db api      # from the repository root; migrations run on start
```

`DATABASE_URL` defaults to `postgresql+psycopg://kori:kori@localhost:5432/kori` for local
development only. Every setting is in `app/config.py`; in production the service refuses to start
with the local token secret or the local sandbox key.

## Layout

| Path | What it holds |
| --- | --- |
| `app/main.py` | Composition root: middleware, routers, metrics, tracing |
| `app/models.py`, `app/schemas.py` | Persistence models and request and response contracts |
| `app/routers/` | HTTP boundaries: `sightings`, `moderation` (review), `trips` (trips and packs), `public_v1` (keyed API), `developer`, `admin`, `privacy`, `uploads`, `handbook`, `health` |
| `app/services/publication.py` | The publication rules (cells, delays, sensitive species), mirroring `shared/rules.ts` |
| `app/services/traces.py` | Server-side trimming of shared trips |
| `app/jobs/` | The idempotent scheduler and maintenance jobs, including trip expiry |
| `alembic/versions/` | `0001` PostGIS, `0002` to `0012` the platform, `0013` Kori's domain |

Never format user input into SQL. Add schema changes through a new Alembic revision.
