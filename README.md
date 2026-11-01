# Kori

Kori is an offline-first safari and wildlife app for Botswana, named after the
kori bustard (kgori in Setswana), the national bird.

You log a sighting with no signal (species, time, photos, a coarse location),
and it waits on your phone until a connection returns. Reviewers approve
sightings before anyone else sees them. Park maps are downloaded before the
trip, so the map and your GPS position work with no mobile signal. Guidance to
a sighting follows known roads and tracks only, and a sighting can be shared
phone to phone with a QR code.

## Why Kori exists

Botswana's safari routes often pass through places with weak or no mobile
coverage, while ordinary social maps are built around a live connection and an
exact point. That is a bad fit for both the visitor and the wildlife. Kori treats
offline maps, review, publication delay and coarse location cells as one product
problem: the visitor can still record what they saw, but the system never turns
that record into a live pointer to an animal. The result is a field workflow for
visitors and guides, a review workflow for trusted moderators, and a data model
that preserves the difference between a private observation and a safe public
sighting.

## What it looks like

These images are captures of the running prototype in Day colours
(Night uses the same layout in Apple's flat dark colours). Every person,
sighting and figure shown in them is sample data, and the app labels it as such.

<table>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/api-docs.webp" alt="The Kori API docs in Day colours: a side navigation of five pages, a draft notice, and the overview page with what you can read from the API and a first curl request." width="100%"><br>
      <sub><b>API docs</b> (draft). Keys, limits and endpoints for researchers and lodges.</sub>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/field-desktop-home.webp" alt="The Kori field app on a wide screen in Day colours: a left rail with Home, Map, Log, Sightings and Offline, and the home page with a What have you seen question, a Log a sighting button, four status tiles and the start of the recent sightings list." width="100%"><br>
      <sub><b>Field app on a wide screen.</b> The same app, with a rail instead of the bottom dock.</sub>
    </td>
  </tr>
</table>

On a phone:

<table>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/field-home.webp" alt="The field app's home screen on a phone in Day colours: a card asking What have you seen with a Log a sighting button and two smaller buttons, the start of the On this phone status tiles, a floating Day and Night button at the bottom left and the navigation dock along the bottom." width="300"><br>
      <sub><b>Home.</b> Log a sighting, even with no signal.</sub>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/field-log.webp" alt="The Log a sighting form on a phone: a search box and a grid of species buttons including African elephant, lion and leopard, with the rest of the form below." width="300"><br>
      <sub><b>Log a sighting.</b> Saved on the phone first.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/field-sightings.webp" alt="The Sightings list on a phone: filter buttons for All, Yours and Shared with you, a note that the data is sample data, and rows for African wild dog, giraffe and kori bustard, each with a small drawing of its 1 km area." width="300"><br>
      <sub><b>Sightings.</b> Each is shown as a 1 km area, never a point.</sub>
    </td>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/field-sighting-qr.webp" alt="A sighting page on a phone, scrolled to Share with no signal: a Route along tracks button above a large black and white QR code that carries the species, count, time and 1 km area, and a Copy link button." width="300"><br>
      <sub><b>A sighting with its QR share.</b> Another phone scans it with no signal.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/field-offline.webp" alt="The Offline and packs page on a phone, scrolled to Park packs: the Sample reserve pack on this phone at 18 KB with a delete button, a Real parks row marked not available, an amber note that the sample reserve is fictional and must not be navigated by, and an Open the map button." width="300"><br>
      <sub><b>Offline and packs.</b> What is stored on the phone.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <img src="docs/screens/field-home-night.webp" alt="The field app's home screen on a phone in Night colours: a flat black canvas with dark grey cards and light text, the same layout as Day, and the floating button showing a moon at the bottom left." width="300"><br>
      <sub><b>Night colours</b>, home.</sub>
    </td>
  </tr>
</table>

## State of the work

An early prototype. The web apps run in the browser with **sample data**. The
backend is built and tested and starts with PostGIS in CI, but it is not
deployed or connected to the apps yet. The register of work, with honest states
and evidence, is [`docs/WORK_ORDERS.md`](docs/WORK_ORDERS.md).

### Real, scaffold, sample, not built

| | What | How it was checked |
| --- | --- | --- |
| **Real, runs in the browser** | Logging a sighting into the phone's storage (IndexedDB), with photos redrawn on the phone to strip hidden location data; the offline outbox; downloading the sample park pack and drawing it with MapLibre without tiles; your GPS position on the map; routing along tracks on the phone; QR codes and the scanner; opt-in trip recording on the phone; the review console's queue and audit log (decisions kept in the browser); Day and Night colours. | Lint, typecheck and build pass for all four apps in CI. Clicked through in a browser: pack download, map, logging, the delay rule, QR display, routing. Not tried on a real phone: the service worker, live GPS, camera scanning, photo re-encoding, trip recording. |
| **Scaffold: code that runs, not yet in use** | The API (accounts, scoped keys, quotas, throttling, audit log, uploads, privacy export and deletion, sighting submission, review, trips, track map, packs, the keyed `/v1` API); migrations to PostGIS; the compose stack; observability (Prometheus, Grafana, Tempo); backup and recovery scripts; release and Kubernetes files; the field app's `HttpStore`. | `pytest`: 93 passed. CI migrates an empty PostGIS 16 database to head and back. CI builds and starts the database and API with compose; `/api/health` reports `healthy`. Monitoring, backups, drills and the rest of the stack have **not** been started. |
| **Private real-map implementation** | A Savuti offline pack with an OpenStreetMap vector basemap and routing graph plus Sentinel-2 imagery. Satellite-first rendering, attribution, checksum-verified storage, OSM-track routing and a fresh offline reload passed 16 of 16 automated checks. | Kept outside the repository and every deployed build. The pack and its captures stay private pending DWNP guidance. |
| **Sample data** | Every sighting not logged by you, every observer ("Sample observer 1" and so on), every review, the invented API keys in the docs, and the built-in fallback reserve, whose tracks are generated and do not match the ground. | Marked "Sample data" where it appears; the map information panel and the Offline and packs page warn that the fallback reserve must not be navigated by. |
| **Not built yet** | Sign-in in the apps and the apps calling the API; a DWNP-approved public real-park pack; sharing trips and the track map built from many trips; Kori-specific metrics; deployment; human-wildlife conflict reports and camera-trap uploads (proposed); predicted tracks from satellite imagery, which wait on a separate feasibility check. | See the register. |

## Safety and privacy

Kori never shows a live animal location: others see a sighting only after
review, at least an hour later, and only as a 1 km area. Sensitive species
(rhino and pangolin in the prototype), dens and nests are a 10 km area after
7 days, and are never guided to or shared. Guidance stays on existing tracks.
Predicted tracks are labelled with their confidence and are off by default.
Trip recording is opt-in per trip, and shared trips are trimmed and deleted on
expiry. The rules run in both the browser and the API, and tests keep the two
identical. Full rules: [`docs/SAFETY_AND_PRIVACY.md`](docs/SAFETY_AND_PRIVACY.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/field/` | The field app (Next.js 16): home, log, map, sightings, sighting with QR share, scan, offline and packs, trips |
| `apps/landing/` | The landing site |
| `apps/review/` | The review console: queue with checks, approve or reject, species rules, audit log |
| `apps/api-docs/` | The API docs (draft); the endpoint table comes from the API's OpenAPI document |
| `shared/` | Tokens, mark and icons, species, publication rules, the sample reserve, routing, share codes; copied into each app by `node scripts/sync-shared.mjs` |
| `api/` | The FastAPI service, Alembic migrations and tests ([`api/README.md`](api/README.md)) |
| `database/`, `compose.yaml` | The PostGIS image and the local stack |
| `observability/`, `ops/`, `deploy/` | Monitoring, backup and recovery, release and Kubernetes scaffolds |
| `docs/` | Safety and privacy rules, design principles, ADRs, deploy, observability and operations guides, the work-order register |
| `tests/`, `scripts/` | Tests for the shared code; sync, name gate, reuse measurement |

How the parts fit: [`ARCHITECTURE.md`](ARCHITECTURE.md). Security:
[`SECURITY.md`](SECURITY.md). Conventions: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Run it

Node 22.18 or later; Python 3.12 or later; Docker for the stack.

```sh
cd apps/field && npm ci && npm run dev        # http://localhost:3100 (landing 3000, review 3300, api-docs 3400)
cd api && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m pytest
docker compose up                             # database, API, scheduler, apps, monitoring
```

Repository checks:

```sh
node --test "tests/*.test.ts"          # shared rules, routing, share codes
node scripts/sync-shared.mjs --check   # the copies of shared/ match the source
node scripts/check-names.mjs           # no names from other products in the tree
docker compose config --quiet          # the stack definition is valid
```

## Deploying

The web apps deploy to Vercel, one project per app; the owner's steps are in
[`docs/DEPLOY.md`](docs/DEPLOY.md). Nothing is deployed yet.

## Where the code came from

Kori started from the owner's own earlier platform. [`PROVENANCE.md`](PROVENANCE.md)
lists every copied file and the measured reuse: 35% of Kori's non-blank lines
are verbatim from it (73% of the API, 84% of the infrastructure, 2% of the web
apps).

## Licence

Copyright (c) 2026 Mooketsi Vincent Magwaza. All rights reserved. There is no
licence file: no permission is granted to use, copy, modify or distribute this
code.
