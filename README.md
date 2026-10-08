# Kori

Kori is an offline-first safari and wildlife app for Botswana, named after the
kori bustard (kgori in Setswana), the national bird.

You log a sighting with no signal (species, time, photos, a coarse location),
and it waits on your phone until a connection returns. Reviewers approve
sightings before anyone else sees them. Park maps are downloaded before the
trip, so the map and your GPS position work with no mobile signal. Guidance to
a sighting follows known roads and tracks only, and a sighting can be shared
phone to phone with a QR code.

## State of the work

This is an early prototype that runs in the browser with **sample data**. The
register of work, with honest states, is [`docs/WORK_ORDERS.md`](docs/WORK_ORDERS.md).

### What is real, what is sample, what is not built

| | |
| --- | --- |
| **Real (runs in the browser today)** | Logging a sighting into the phone's own storage (IndexedDB), with photos redrawn on the phone to strip their hidden location data; the offline outbox; downloading the sample park pack into the phone and drawing it with MapLibre without any tiles; your GPS position on the map; routing along tracks on the phone; QR codes for a sighting and a scanner that reads them; opt-in trip recording kept on the phone; Day and Night colours. |
| **Sample data** | Every sighting not logged by you, every observer ("Sample observer 1" and so on), every review, and the reserve itself, which is **fictional**: its tracks are generated and do not match the ground at its coordinates. The "GPS-confirmed" and "predicted" track labels in the sample are sample labels. |
| **Not built yet** | The API server (so nothing is ever sent; "Send now" says so), real park packs, sharing trips, the track map built from many trips, reviewer sign-in and a shared review store, the API docs, and imagery-based predicted tracks (which depend on a separate feasibility check). |

What has been checked, and what has not, is recorded per work order.

## Safety and privacy

Kori never shows a live animal location: others see a sighting only after
review, at least an hour later, and only as a 1 km area. Sensitive species
(rhino and pangolin in the prototype), dens and nests are a 10 km area after
7 days, and are never guided to or shared. Guidance stays on existing tracks.
Predicted tracks are labelled with their confidence and are off by default.
Trip recording is opt-in per trip. The full rules are in
[`docs/SAFETY_AND_PRIVACY.md`](docs/SAFETY_AND_PRIVACY.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/field/` | The field app (Next.js 16): home, log, map, sightings, sighting with QR share, scan, offline and packs, trips |
| `apps/landing/` | The landing site (Next.js 16, static) |
| `apps/review/` | The review console: queue with checks, approve or reject, species rules, audit log (decisions kept in the browser) |
| `shared/` | Tokens, mark and icons, species, publication rules, the sample reserve, routing, share codes; copied into each app by `node scripts/sync-shared.mjs` |
| `tests/` | Tests for the shared rules, routing and share codes |
| `scripts/` | Sync and check scripts, including the name gate |
| `docs/` | Design, safety and privacy rules, the work-order register |

## Run it

Node 22.18 or later.

```sh
cd apps/field
npm ci
npm run dev          # http://localhost:3100
npm run build        # production build
```

The landing site is the same in `apps/landing` (port 3000).

Checks from the repository root:

```sh
node --test "tests/*.test.ts"          # shared rules, routing, share codes
node scripts/sync-shared.mjs --check   # the copies of shared/ match the source
node scripts/check-names.mjs           # no names from other products in the tree
```

## Where the code came from

Kori started from the owner's own earlier code. [`PROVENANCE.md`](PROVENANCE.md)
lists which files started from it and which are new.

## Licence

Copyright (c) 2026 Mooketsi Vincent Magwaza. All rights reserved. There is no
licence file: no permission is granted to use, copy, modify or distribute this
code.
