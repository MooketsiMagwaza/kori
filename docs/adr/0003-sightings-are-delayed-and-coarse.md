# 0003. Publish sightings late and as an area, never a point

- **State:** accepted, 7 October 2026 (the values are proposals until agreed with DWNP)

## Context

A sighting app can lead people to animals, and that includes poachers. Rhino are poached in
southern Africa, dens and nests are easily disturbed, and a crowd of vehicles converging on a live
sighting harms animals and breaks park rules. The owner's rules: no live animal locations;
sensitive species only ever as a coarse area and never guided to.

## Decision

- A sighting is published only after review **and** after a delay: at least 1 hour for standard
  species, 7 days for sensitive species.
- It is published as a grid cell, never the recorded point: 1 km for standard species, 10 km for
  sensitive species. Times are rounded down to the quarter hour.
- Sensitive species (rhino and pangolin in the prototype), and any den or nest, get no guidance and
  no QR share. Unknown species are treated as sensitive.
- `visibleFrom` is fixed when a sighting is submitted, so a later change of rules can never expose
  an old sighting early.
- The same rules run in the browser (`shared/rules.ts`) and on the server
  (`api/app/services/publication.py`); a test checks that both compute the same grid.
- The public API answers 404 for a sighting that is not yet public, so it never confirms that
  something was seen.

## Consequences

- Kori cannot be used to chase a live sighting, by design. Guides who want to share in real time
  still can by radio, outside Kori.
- The grid is fixed for the whole country from one reference latitude; cells are not exactly square
  away from 22° S, which is acceptable for coarsening.
- The sensitive list, delays and cell sizes must be agreed with the Department of Wildlife and
  National Parks before any park is covered publicly.
