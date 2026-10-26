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
- The soft glass look (25 October 2026): the owner's design on the source's branch `feat/soft-glass`,
  commit `2baadbf` (its pull request is open, so it is not on `main` yet), read with `git show`
  from `origin/feat/soft-glass`. Only tokens, the design principles and the rider's stylesheet
  were read, and the source's working tree was not used.
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
| `shared/theme-toggle.tsx` | `design/theme-toggle.tsx` | `useSyncExternalStore`, new storage key; rewritten as a floating round button (both icons in the markup, chosen by CSS) with a constant name and `aria-pressed` |
| `shared/tokens.css` | `design/tokens.css` (structure and variable names; from `2baadbf`, the soft glass values) | The canvas washes, translucent surfaces and glass, ink, link blue, shadows, radii and the Night values come from the source. Kori's brand green, map palette, marker shadow, code, phone-frame and QR tokens are new, the Night washes and fills are softened so every pair passes AA, and the contrast figures come from Kori's own script |
| `apps/field/app/globals.css`, `apps/review/app/globals.css`, `apps/landing/app/globals.css`, `apps/api-docs/app/globals.css` | `rider/app/globals.css` (from `2baadbf`; the look only) | Rewritten for Kori's components and class names; the shared ideas are the fixed wash layer, pill buttons with an ink primary, a floating glass dock and rail, translucent cards and blur only on things that float |
| `shared/geo.ts` (two functions) | `rider/lib/geo.js` | Ported to TypeScript on [lon, lat] pairs |
| `shared/routing.ts` | `api/app/services/routing.py` (the idea: Dijkstra over a graph built from edges) | New TypeScript code |
| `apps/field/lib/store/local-store.ts` (outbox replay) | `rider/lib/outbox.ts` | IndexedDB, per-sighting idempotency keys, no 20-item cap |
| `apps/field/public/sw.js` | `rider/public/sw.js` | Precaches every screen and its build files; never caches packs |
| `apps/field/scripts/copy-maplibre-worker.mjs`, `lib/maplibre-setup.ts`, `components/sw-register.tsx`, `next.config.ts` | the matching `rider/` files | Comments and headers adapted |
| `apps/*/eslint.config.mjs`, `tsconfig.json`, `Dockerfile` | `rider/eslint.config.mjs`, `tsconfig.json`, `Dockerfile` | Kori ports, Node 24, `.ts` imports allowed |
| `docs/DESIGN_PRINCIPLES.md` | `docs/DESIGN_PRINCIPLES.md` (checklist format; the soft glass rules from `2baadbf`) | Rewritten for field use in sun and with no signal, then for soft glass in blue and green |

## What is new for Kori

- Every screen of the four web apps, the park map, guidance, QR sharing and scanning, trips, photo
  re-encoding, the review console, the landing site and the API docs.
- The Kori mark, icons, brand green, map palette, type and field-use rules, the map style
  (`shared/map-style.ts`), marker grouping (`shared/map-markers.ts`) and the contrast check
  (`scripts/check-contrast.mjs`).
- Species, publication rules, the fictional sample reserve, sample sightings, share codes, and
  their tests (`shared/`, `tests/`).
- The API's Kori domain: species, sightings with the publication rules, review decisions, trips
  and server-side trimming, the track map, park packs, workspaces, migration `0013`, the keyed
  `/v1` API, the OpenAPI export, and their tests.
- The safety and privacy rules, the ADRs, the observability and operations guides, the deploy
  guide, the work-order register, the name gate and the reuse measurement.

## The real map (KO-25, 26 October 2026)

No Tsela code is in this work, and nothing third-party is copied into the repository.

- `tools/map-pack/` is new. `fetch_s2.py` and `fetch_osm.py` follow the approach of the imagery
  check scripts the owner commissioned on 7 October 2026 (`kori-research/imagery-check-2026-10-07`,
  outside this repository): the same Earth Search item, the block-aligned Sentinel-2 window and
  the Overpass retry loop; they were rewritten (a range-request file opener for rasterio, a byte
  budget checked before any read, a new, empty output folder).
- The real-pack style in `shared/map-style.ts` is written for Kori on the Protomaps v4 tile schema;
  no Protomaps style (`@protomaps/basemaps`) code or colours were copied.
- Packages added from the npm registry, not copied: `pmtiles` (BSD-3-Clause) and
  `@fontsource/noto-sans` (the Noto Sans fonts, SIL Open Font License 1.1) in the field app;
  `pmtiles`, `@mapbox/vector-tile` and `pbf` (BSD-3-Clause) for the map-pack inspector. The font
  files are copied into `apps/field/public/map-fonts` at build time with their licence, and are not
  committed.
- Python packages from PyPI, used only to build packs outside the repository: rasterio (with its
  bundled GDAL), numpy, Pillow, pyproj, shapely, requests.
- The `pmtiles` command-line tool, v1.31.2 for Windows x86_64, from the official
  `protomaps/go-pmtiles` GitHub release; its SHA-256
  (`a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1`) matched the digest GitHub
  publishes for that release asset (the release has no separate checksums file). Kept outside the
  repository.
- Data in a pack (never committed): OpenStreetMap (ODbL 1.0) through the Protomaps daily build of
  25 October 2026 and the Overpass API on 26 October 2026; Sentinel-2 L2A scene
  `S2B_34KHE_20250802_0_L2A` (Copernicus Sentinel data, free with credit) from the AWS open-data
  bucket through the Earth Search catalogue.
