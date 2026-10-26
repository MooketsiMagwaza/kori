# Wildlife safety and privacy rules

These rules are non-negotiable. They apply to the prototype, to sample data,
to the API and to anything published later. Where a value is a proposal (a
delay, a cell size), it is marked as one and will be agreed with the
Department of Wildlife and National Parks (DWNP) before any park is covered
publicly.

## Animals

1. **No live animal locations.** A sighting is published only after a delay
   (proposed: at least 1 hour after it was seen) and only as a grid cell, never
   as the exact point the observer recorded.
2. **Sensitive species are never guided to.** Rhino and pangolin are on the
   sensitive list in the prototype; the real list is set with DWNP. A sighting
   that the observer marks as a den or a nest is treated as sensitive whatever
   the species. Sensitive sightings are shown only as presence in a coarse
   cell (proposed: 10 km), after a longer delay (proposed: 7 days), and they
   have no route, no QR share and no exact point in any public output.
3. **Exact points stay private.** The observer's own phone keeps the exact
   point it recorded. Reviewers can see it. The public API, other people's
   phones and QR codes only ever carry the cell.
4. **Closed and protected areas.** No tracks or sightings are published inside
   areas the park authority flags. Management and patrol tracks marked closed
   are never shown.

## Tracks and guidance

1. **Guidance stays on existing roads and tracks.** Routes are computed only
   over the track graph. The destination is the nearest track point to the
   sighting's published cell, never the animal.
2. **Never invite off-road driving.** Off-road and night driving are not
   allowed in Botswana's parks and reserves. If you leave the route, the app
   shows how to rejoin it by the track, never a straight line.
3. **Predicted is labelled.** Any generated or predicted path is drawn dashed
   and muted, labelled "Predicted, not verified" with its confidence level,
   and left out of routing unless you switch it on. It is no substitute for a
   guide, park staff or a verified GPS track, and the app says so.
4. **Machine-learned tracks are not built yet.** They depend on a separate
   feasibility check (WO-009 in the portfolio work orders). The predicted
   tracks in the sample area are sample data, labelled as such.

## GPS traces (personal data)

GPS traces show where a person was and when. Under Botswana's Data Protection
Act, 2024 they are personal data. Kori's rules:

1. **Opt-in per trip.** Recording is off by default and is switched on for
   one trip at a time, separately from logging sightings.
2. **Kept on the phone first.** A trace stays on the phone during the trip.
   Nothing uploads while you are driving.
3. **Trimmed and delayed before sharing.** If you choose to share a finished
   trip, the first and last kilometre and any points outside the park are
   removed, times are rounded to the minute, no device identifier is sent, and
   the trace is held back (proposed: 24 hours) before it is used.
4. **Only aggregates are published.** Only track segments supported by at
   least 3 separate trips are published. Raw traces are never returned by the
   API.
5. **Deletable.** You can delete any trip on your phone at any time. Shared
   raw traces are deleted after a fixed period (proposed: 90 days) and you can
   ask for yours to be deleted earlier.
6. **Still to check:** whether Kori must register as a data controller and
   where data may be hosted. This must be checked with counsel or the
   Information and Data Protection Commission before real users.

## Photos

Photos are re-encoded on the phone before they are saved. Re-encoding drops
the photo's metadata, including any GPS position the camera wrote into it.

## Sample data

Everything shown in the prototype is sample data unless a screen says
otherwise: the sightings, the observers, the reviews, the API keys and the
sample reserve. The sample reserve is fictional. Its shapes and tracks do not
match the ground at its coordinates, and it must not be used to navigate.

## Real park packs (private, for development)

Since 26 October 2026 Kori can draw a real park from a pack built by
`tools/map-pack` (KO-25). The owner chose the Savuti area of Chobe National
Park, for private use only. Covering a real park publicly waits for DWNP
(KO-09, KO-14), so:

1. **Never committed, never deployed, never published.** Packs are built and
   kept outside the repository (`kori-research/real-map/packs`); `.gitignore`
   refuses `*.pmtiles`, `*.mbtiles`, `*.npy` and pack folders, and the build
   script refuses a pack folder inside the repository. The field app serves a
   pack only from the folder named by `KORI_LOCAL_PACKS_DIR` on the machine
   running it, and only the five files a pack is made of; with the variable
   unset, as on every deployment, `/packs/local` answers 404 and the app uses
   the sample reserve. Serve it on `127.0.0.1` (`next start -H 127.0.0.1`), not
   on every network interface, so nobody else on the network can fetch it.
2. **On the phone.** A downloaded pack lives in the phone's own storage (the
   origin private file system, or IndexedDB where that is missing) and can be
   deleted from Offline and packs or with "Delete Kori's data".
3. **Sightings on a real map are still sample data.** The app's 24 sample
   sightings keep their species, counts, times and sensitivity; only their
   positions move to the middle of 1 km areas near real tracks, inside the
   park, off water, and with their published area at least 5 km clear of any
   OpenStreetMap feature named after rhino (a name is not evidence of rhino,
   but nothing is assumed). No known rhino area is in the Savuti window to
   our knowledge; that assumption is for the owner to confirm with DWNP. The
   publication rules are unchanged: sensitive species are 10 km areas after
   7 days, never guided to, never shared.
4. **Tracks are OpenStreetMap's, not verified.** Every edge carries
   "OSM, not verified" in the key and on the route sheet, until GPS trips
   confirm it (KO-10). A way OpenStreetMap tells drivers to avoid costs four
   times as much to route over. Closed and private ways are left out of the
   graph. There are no predicted tracks in a real pack.
5. **Credits and licences.** "© OpenStreetMap contributors" is on screen
   whenever a real pack is drawn, and "Contains modified Copernicus Sentinel
   data 2025" whenever the satellite layer is on. Anything derived from
   OpenStreetMap (the base map, the track graph) is ODbL 1.0, whatever the
   licence of Kori's code; the About page says so.
