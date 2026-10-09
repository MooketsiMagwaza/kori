# Provenance

Kori is owned outright by Mooketsi Vincent Magwaza, who also owns the earlier product it started
from. That product is **Tsela**, a private transit app. Kori reuses Tsela's product-independent
code by copying it, with a fresh git history. No Tsela git history, transit code, transit data,
brand, or company and business documents are in this repository.

This file is the only file in the repository allowed to name Tsela; the name gate
(`scripts/check-names.mjs`) fails on the name anywhere else.

## Source

- Repository: the owner's private Tsela repository, branch `main`, commit `c1f1d8f` (fetched on
  7 and 9 October 2026), exported with `git archive`, so only tracked files were read. `.env` files
  were excluded from every export and were not read. The source's working tree was never used.
- Left out on purpose: the business plan, company structure, standards and compliance, pitch and
  research material, journal articles, screenshots, the transit schema, routes, stops, GTFS,
  pathfinding, the optimiser, road geometry, community posts and route contributions, transit seed
  data, pgRouting, local demo credentials, and every Tsela name, prefix and image.

## Measured reuse

Measured on 9 October 2026 with `python scripts/measure-reuse.py <export of c1f1d8f>`, at the head
of `feat/engineering-signals` (commit `5f60389`). It counts non-blank lines. "Kept verbatim" lines
are identical to the source file the Kori file started from; "adapted" lines are the rest of those
files; files with no source are new. Lock files, images, generated files and the apps' copies of
`shared/` are excluded.

| Area | Kept verbatim from the source | Adapted lines in copied files | Lines in new files | Total | Share kept |
| --- | ---: | ---: | ---: | ---: | ---: |
| API (`api/`) | 4,294 | 822 | 766 | 5,882 | 73% |
| Infrastructure (`database/`, `observability/`, `ops/`, `deploy/`, `compose.yaml`) | 1,691 | 312 | 0 | 2,003 | 84% |
| CI and scripts | 131 | 221 | 136 | 488 | 27% |
| Shared code and its tests | 72 | 192 | 1,006 | 1,270 | 6% |
| Web apps (`apps/`) | 188 | 393 | 7,103 | 7,684 | 2% |
| Documents | 10 | 213 | 511 | 734 | 1% |
| **All** | **6,386** | **2,153** | **9,522** | **18,061** | **35%** |

The planning estimate in the portfolio work orders was 50 to 65% reuse by lines. The measured
figure is 35% verbatim, or 47% if adapted lines in copied files are counted as reused. The backend
and infrastructure are mostly reuse; the four web apps, the shared domain code and the documents
are mostly new.

**File tree.** Of the 126 files in the source's foundation (`api/`, `database/`, `observability/`,
`ops/`, `deploy/`, `.github/`, `compose.yaml` and the four root documents), 108 have a Kori
counterpart. The 18 left out are all in `api/`: the transit routers and services (routes,
pathfinding, community, dashboard, optimiser, road geometry, route freshness, routing, contribution
review), the transit schema migration, the transit seed, and their seven tests.

## What started from Tsela code

| Kori path | Started from (Tsela path) | What changed |
| --- | --- | --- |
| `api/app/` platform modules: `config.py`, `database.py`, `cli.py`, `main.py`, `metrics.py`, `telemetry.py`, `request_context.py`, `handbook.py`, `jobs/`, `routers/admin.py`, `developer.py`, `handbook.py`, `health.py`, `privacy.py`, `uploads.py`, `services/api_access.py`, `audit.py`, `identity.py`, `object_store.py`, `outbound_http.py`, `rate_limit.py`, `security.py`, `throttle.py` | the same paths | Renamed; transit settings and pgRouting removed; Kori scopes, key and token prefixes; privacy export and deletion cover sightings and trips; trip expiry job; handbook pages are Kori's documents |
| `api/app/models.py`, `api/app/schemas.py` | the same paths | Transit models and schemas removed; Kori's domain added |
| `api/app/routers/moderation.py`, `public_v1.py`, `api/app/services/service_area.py` | the same paths | Rewritten for sightings review, the keyed sightings API and Botswana's envelope; report resolution and the audit list kept |
| `api/alembic/` (env, template, `0002` to `0012`) | the same paths (`0002` and `0003` renamed) | Transit tables and columns removed; functions renamed |
| `api/tests/` platform tests | the same paths | Transit references replaced with Kori's |
| `api/Dockerfile`, `api/pyproject.toml`, `api/alembic.ini` | the same paths | Seed step and `ortools` removed; Kori names and database |
| `database/` | `database/` | PostgreSQL 16, pgRouting removed, README rewritten |
| `compose.yaml` | `compose.yaml` | Kori's four apps replace the transit web services; demo credentials removed; Kori ports and names |
| `observability/` | `observability/` | Renamed (dashboard, jobs, database label) |
| `ops/` | `ops/` | Renamed; backup image on PostgreSQL 16; the restore drill checks Kori's species data |
| `deploy/` | `deploy/` | Workloads, ports and hosts renamed for Kori's apps; map-match settings |
| `.github/workflows/ci.yml`, `security.yml`, `dependabot.yml`, `PULL_REQUEST_TEMPLATE.md` | the same paths | Kori's jobs (PostGIS migrations, compose smoke test, four apps); security without CodeQL; Kori's areas |
| `SECURITY.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` | the same paths | Rewritten for Kori; little text kept |
| `scripts/sync-shared.mjs` | `design/sync.mjs` | Copies the whole `shared/` folder, removes stale copies |
| `shared/theme-toggle.tsx` | `design/theme-toggle.tsx` | `useSyncExternalStore`, Day and Night labels, new storage key |
| `shared/tokens.css` | `design/tokens.css` (structure and variable names) | Every value is new |
| `shared/geo.ts` (two functions) | `rider/lib/geo.js` | Ported to TypeScript on [lon, lat] pairs |
| `shared/routing.ts` | `api/app/services/routing.py` (the idea: Dijkstra over a graph built from edges) | New TypeScript code |
| `apps/field/lib/store/local-store.ts` (outbox replay) | `rider/lib/outbox.ts` | IndexedDB, per-sighting idempotency keys, no 20-item cap |
| `apps/field/public/sw.js` | `rider/public/sw.js` | Precaches every screen and its build files; never caches packs |
| `apps/field/scripts/copy-maplibre-worker.mjs`, `lib/maplibre-setup.ts`, `components/sw-register.tsx`, `next.config.ts` | the matching `rider/` files | Comments and headers adapted |
| `apps/*/eslint.config.mjs`, `tsconfig.json`, `Dockerfile` | `rider/eslint.config.mjs`, `tsconfig.json`, `Dockerfile` | Kori ports, Node 24, `.ts` imports allowed |
| `docs/DESIGN_PRINCIPLES.md` | `docs/DESIGN_PRINCIPLES.md` (checklist format) | Rewritten for field use in sun and with no signal |

## What is new for Kori

- Every screen of the four web apps, the park map, guidance, QR sharing and scanning, trips, photo
  re-encoding, the review console, the landing site and the API docs.
- The Kori mark, icons, palette, type and field-use rules.
- Species, publication rules, the fictional sample reserve, sample sightings, share codes, and
  their tests (`shared/`, `tests/`).
- The API's Kori domain: species, sightings with the publication rules, review decisions, trips
  and server-side trimming, the track map, park packs, workspaces, migration `0013`, the keyed
  `/v1` API, the OpenAPI export, and their tests.
- The safety and privacy rules, the ADRs, the observability and operations guides, the deploy
  guide, the work-order register, the name gate and the reuse measurement.
