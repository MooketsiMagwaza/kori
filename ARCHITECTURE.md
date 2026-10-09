# Architecture

Kori has four web apps, one API, one database, and the tooling around them. What is real and what
is a scaffold is stated in the README and in `docs/WORK_ORDERS.md`.

```
  Phone, often with no signal                     Desk
  ┌──────────────────────────────┐   ┌───────────────────────┐  ┌───────────────────┐
  │ apps/field (Next.js, PWA)    │   │ apps/review (Next.js) │  │ apps/landing,     │
  │  service worker: app shell   │   │  review queue, audit  │  │ apps/api-docs     │
  │  IndexedDB: sightings,       │   └──────────┬────────────┘  │ (static)          │
  │   photos, outbox, packs,     │              │               └───────────────────┘
  │   trips                      │              │
  │  MapLibre: pack, GPS, route  │              │  HTTPS, JSON, bearer tokens
  └──────────────┬───────────────┘              │
                 │ when online: outbox replay   │
                 │ with idempotency keys        │
          ┌──────▼──────────────────────────────▼─────┐      ┌──────────────────────────┐
          │ api (FastAPI)                             │◄─────┤ Researchers and lodges:  │
          │  /api: sightings, review, trips, packs,   │ keyed│ /v1 sightings, species,  │
          │        accounts, keys, privacy, admin     │  API │ tracks (scoped keys)     │
          │  rules: services/publication.py           │      └──────────────────────────┘
          │  scheduler: trip expiry, cleanup, purges  │
          └──────┬───────────────────────┬────────────┘
                 │ SQLAlchemy, Alembic   │ metrics, traces
          ┌──────▼──────────┐     ┌──────▼──────────────────────────┐
          │ PostgreSQL 16   │     │ Prometheus, Grafana, Tempo      │
          │ + PostGIS       │     │ (observability/)                │
          └─────────────────┘     └─────────────────────────────────┘
```

## The rules live in two places, kept identical

The publication rules (1 km or 10 km cell, 1 hour or 7 day delay, no guidance or QR share for
sensitive species, dens and nests) are in `shared/rules.ts` for the browser and in
`api/app/services/publication.py` for the server. A test computes the same grid cells with both.
The species list is in `shared/species.ts` and `api/app/species_seed.py`; a test compares them row
by row.

## The field app works with no signal

- The service worker saves every screen and its build files on install (`apps/field/public/sw.js`).
- Data lives in IndexedDB behind one interface, `KoriStore` (ADR 0002). `LocalStore` is the
  default; `HttpStore` adds the API behind `NEXT_PUBLIC_KORI_DATA_SOURCE=http` (a scaffold).
- Park packs are downloaded into IndexedDB and drawn by MapLibre with no tiles.
- Routing runs on the phone over the pack's track graph (`shared/routing.ts`), on tracks only.

## Shared code

`shared/` holds the tokens, mark, icons, species, rules, the fictional sample reserve, routing and
share codes. `scripts/sync-shared.mjs` copies it into each app, because each app deploys on its own
(one Vercel project per app); CI fails if a copy drifts.

## Data

| Table | Holds | Personal or sensitive |
| --- | --- | --- |
| `DeveloperAccount`, `DeveloperSession`, `ApiKey`, `ApiUsage` | Accounts, sessions, keys, usage | Personal |
| `Workspace`, `WorkspaceMember` | Organisations that hold keys | Personal (membership) |
| `Species` | Reference data, seeded by migration 0013 | No |
| `Sighting`, `SightingPhoto`, `ReviewDecision` | Sightings, photos, decisions | Exact point is sensitive |
| `Trip` | Shared, trimmed GPS traces; deleted at expiry | Personal |
| `TrackEdge`, `ParkPack` | The track map and downloadable packs | No |
| `AuditEvent`, `ContentReport`, `ConsentRecord`, `IdempotencyRecord`, `UploadIntent` | Platform records | Some |

Positions are plain `lon` and `lat` columns; migration 0013 adds PostGIS geometry as generated,
GIST-indexed columns.

## Where things run

- **Web apps:** Vercel, one project per app (`docs/DEPLOY.md`). Not deployed yet.
- **API, database, monitoring:** `compose.yaml` locally; `deploy/` holds release and Kubernetes
  scaffolds. Not deployed.
