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
