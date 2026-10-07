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

This is an early prototype. The register of work, with honest states, is
[`docs/WORK_ORDERS.md`](docs/WORK_ORDERS.md). What is built so far:

- The design system: Day and Night colours, type, the Kori mark and icons
  (`shared/`), and the rules in [`docs/DESIGN_PRINCIPLES.md`](docs/DESIGN_PRINCIPLES.md).
- The wildlife safety and privacy rules every screen follows:
  [`docs/SAFETY_AND_PRIVACY.md`](docs/SAFETY_AND_PRIVACY.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `shared/` | Design tokens, mark, icons; copied into each app by `node scripts/sync-shared.mjs` |
| `scripts/` | Sync and check scripts, including the name gate |
| `docs/` | Design, safety and privacy rules, the work-order register |

## Checks

```sh
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
