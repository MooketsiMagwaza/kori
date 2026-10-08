# Work orders

The register of every piece of work on Kori. Each entry is updated in the same
commit as the change it describes.

**Standing rule (the owner, 7 October 2026):** every new instruction from the
owner gets a work-order entry here.

States: **Not started**, **In progress**, **Done** (with the evidence),
**Blocked** (with what it waits for).

## Instructions received

| Date | Instruction (paraphrased) | Work orders |
| --- | --- | --- |
| 7 Oct 2026 | Build Kori, an offline-first safari and wildlife app for Botswana, as a flagship; it replaces the earlier transit app in the portfolio and must not look like a copy of it or carry its domain, names, data or company documents. | KO-01, KO-02 |
| 7 Oct 2026 | Appearance first: a landing page, a field app (home, log a sighting, map with your position, recent sightings, offline status and downloaded packs), a sighting page with QR share, a review console, API docs. Light and dark, phone first, accessible. | KO-02, KO-03, KO-04, KO-06, KO-07 |
| 7 Oct 2026 | Deployment second: deployable to Vercel, a CI workflow for lint and build, and `docs/DEPLOY.md` with the exact steps for the owner. | KO-05 |
| 7 Oct 2026 | Working features third: browser front-end with labelled sample data and a data layer behind an interface (IndexedDB now, the API later). Do not claim anything works unless it was run. | KO-03, KO-08 |
| 7 Oct 2026 | Wildlife, privacy and safety rules: no live locations, sensitive species coarse and never guided to, guidance on tracks only, predicted paths labelled with confidence, GPS traces opt-in per trip, trimmed, delayed and deletable. | KO-02 (rules written), KO-03, KO-10 |
| 7 Oct 2026 | Private repository `kori`, all rights reserved with no licence file, fresh history, `PROVENANCE.md`. | KO-01 |
| 7 Oct 2026 | Git: conventional commits, one branch per piece, pull requests merged with merge commits, no attribution trailers, nothing secret committed. | All |
| 7 Oct 2026 | Machine-learned tracks from Sentinel-2 come later and depend on WO-009; do not build or wait for them. | KO-13 |

## Register

| ID | Work | State | Evidence or what it waits for |
| --- | --- | --- | --- |
| KO-01 | Repository: private GitHub repository, fresh history, all rights reserved, `PROVENANCE.md`, this register, a name gate. | Done | Private repository `MooketsiMagwaza/kori` created 7 Oct 2026. Name gate (`node scripts/check-names.mjs`) passes locally. Merged in PR #1. |
| KO-02 | Design system: tokens for Day and Night, the Kori mark and icons, design principles, safety and privacy rules, sync tooling. | Done | `shared/`, `docs/DESIGN_PRINCIPLES.md`, `docs/SAFETY_AND_PRIVACY.md`. Contrast figures in `shared/tokens.css` were computed with a script, not estimated. Merged in PR #1. |
| KO-03 | Field app prototype: home, log a sighting, map with your position, recent sightings, sighting page with QR share, offline status and packs; sample data; IndexedDB data layer. | Done (prototype) | PR #2. `npm run lint`, `tsc --noEmit` and `npm run build` pass in `apps/field`; 8 shared tests pass (`node --test "tests/*.test.ts"`). Checked in a browser on 8 Oct 2026: the sample pack downloads into IndexedDB (18 KB), the map draws it, a sighting logged through the form is saved and shown with its 1 km area, the 1 hour delay blocks guidance and QR share for it, an older sample sighting shows a QR code, and guidance draws a 24 km route from the gate. **Not verified:** the service worker (the test browser refused to register it), a live GPS fix, camera scanning, photo re-encoding and trip recording on a real phone. |
| KO-04 | Landing site. | Not started | |
| KO-05 | Deployment: Vercel settings per app, CI for lint and build, `docs/DEPLOY.md`. | Not started | |
| KO-06 | Review console: queue, checks, approve or reject, species sensitivity, audit list. | Not started | |
| KO-07 | API docs site: keys and scopes, rate limits, endpoints, data rules, sample responses. | Not started | |
| KO-08 | API service: copy the platform parts of the base code (accounts, keys, scopes, throttle, audit, uploads, review), remove the transit domain, add sightings. | Not started | |
| KO-09 | Real offline park packs (PMTiles or MBTiles, vector and raster) and a pack builder. | Not started | Waits for the owner to ask DWNP before any real park is covered publicly. |
| KO-10 | Trip recording on the phone, trimming, delayed sharing, and the aggregated track map (3 or more trips per segment). | Not started | |
| KO-11 | Guidance on tracks: routing on the phone over the track graph, sensitive species excluded, predicted tracks off by default, rejoin by track. | In progress | Routing over the sample graph, the exclusions and the delay are in `shared/` and covered by tests; the map draws the route (PR #2). The off-route warning has not been tried with a moving GPS fix. Routing runs on the main thread; a Web Worker is not needed at this graph size and is not built. |
| KO-12 | QR scanning of shared sightings with the camera. | In progress | Scanner screen written (BarcodeDetector, jsQR fallback, paste a link) in PR #2. Decoding and validation are tested; scanning with a real camera has not been tried. |
| KO-13 | Predicted tracks from Sentinel-2 imagery. | Blocked | Waits for the WO-009 feasibility decision. Not to be built before it passes. |
| KO-14 | Before going public: security review of copied code, secret scan of history, sensitive-species list and delays agreed with DWNP, data-protection check with counsel. | Not started | Owner decisions. |
