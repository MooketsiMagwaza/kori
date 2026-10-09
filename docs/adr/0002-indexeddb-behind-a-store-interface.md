# 0002. Keep field data in IndexedDB behind a store interface

- **State:** accepted, 7 October 2026

## Context

The field app must keep a trip's worth of sightings, photos, an outbox, park packs and GPS traces
on the phone, and must not wait for the API, which was not built when the app was. The earlier
platform's offline outbox used `localStorage` and capped it at 20 drafts.

## Decision

Screens talk only to one interface, `KoriStore` (`apps/field/lib/store/types.ts`). Today it is
implemented by `LocalStore` on IndexedDB (through the small `idb` library). A second
implementation, `HttpStore`, speaks to the Kori API and is chosen with a build-time flag. Sending
queued sightings uses one idempotency key per sighting, so a retry can never create a duplicate.

## Consequences

- Screens did not change when the server side was added, and will not when `HttpStore` is wired up.
- IndexedDB holds photos as blobs and has no practical size cap at trip scale, unlike
  `localStorage`.
- Sample data is generated in the browser and never stored, so it cannot leak into a user's own
  records and resets naturally.
- **Cost:** two implementations must keep the same behaviour. The shared types and the shared
  publication rules (`shared/rules.ts`, mirrored in `api/app/services/publication.py` and checked by
  tests) limit how far they can drift.
