# Provenance

Kori is owned outright by Mooketsi Vincent Magwaza, who also owns the earlier
product it started from. That product is **Tsela**, a private transit app.
Kori reuses Tsela's product-independent code by copying it, with a fresh git
history. No Tsela git history, transit code, transit data, brand, or company
and business documents are in this repository.

This file is the only file in the repository allowed to name Tsela; the name
gate (`scripts/check-names.mjs`) fails on the name anywhere else.

## Source

- Repository: the owner's private Tsela repository, branch `main`.
- Commit copied from: `c1f1d8f` (fetched 7 October 2026), exported with
  `git archive` so only tracked files were read. `.env` files were excluded
  from the export and were not read.
- Left out on purpose: business plan, company structure, standards and
  compliance, pitch and marketing research, journal articles, screenshots,
  transit schema, routes, stops, GTFS, pathfinding and optimiser code, transit
  seed data, and every Tsela name, prefix and image.

## What started from Tsela code

| Kori path | Started from (Tsela path) | What changed |
| --- | --- | --- |
| `scripts/sync-shared.mjs` | `design/sync.mjs` | Copies the whole `shared/` folder into `apps/*/shared/`, removes stale copies |
| `shared/theme-toggle.tsx` | `design/theme-toggle.tsx` | New storage key, Day and Night labels, optional visible label |
| `shared/tokens.css` | `design/tokens.css` (structure and variable names only) | Every value is new: palette, type, sizes, map colours |
| `docs/DESIGN_PRINCIPLES.md` | `docs/DESIGN_PRINCIPLES.md` (checklist format) | Rewritten for field use in sun and with no signal |
| `shared/geo.ts` (`distanceMeters`, `distanceToPolylineMeters`) | `rider/lib/geo.js` | Ported to TypeScript on [lon, lat] pairs; the other helpers are new |
| `shared/routing.ts` | `api/app/services/routing.py` (the idea: Dijkstra over a graph built from edges) | New TypeScript code; snapping to track vertices, status costs and exclusions are new |
| `apps/field/lib/store/local-store.ts` (outbox replay) | `rider/lib/outbox.ts` | IndexedDB instead of localStorage, per-sighting idempotency keys, no 20-item cap |
| `apps/field/public/sw.js` | `rider/public/sw.js` (versioned caches, timeouts, offline fallback) | Precaches every screen and its build files; never caches packs |
| `apps/field/scripts/copy-maplibre-worker.mjs`, `apps/field/lib/maplibre-setup.ts` | `rider/scripts/copy-maplibre-worker.mjs`, `rider/lib/maplibre-setup.ts` | Comments rewritten |
| `apps/field/components/sw-register.tsx` | `rider/components/sw-register.tsx` | Unchanged apart from the comment |
| `apps/field/next.config.ts` (security headers) | `rider/next.config.ts` | Camera allowed for this origin, agent files off |

More rows are added in the same pull request as each copied piece.

## What is new for Kori

- The Kori mark and icon set (`shared/icons.tsx`).
- The palette, type choice and field-use rules.
- The wildlife safety and privacy rules (`docs/SAFETY_AND_PRIVACY.md`).
- The work-order register (`docs/WORK_ORDERS.md`).
- The name gate (`scripts/check-names.mjs`).
- Species, publication rules, the sample reserve generator, sample sightings and share codes (`shared/`), and their tests.
- Every field app screen, the park map, QR sharing and scanning, trips, and the photo re-encoding.
