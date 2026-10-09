# 0001. Ship an offline-first web app before a native app

- **State:** accepted, 7 October 2026
- **Deciders:** the owner; recorded by the engineering lead

## Context

Kori is used in parks where there is usually no mobile signal. People need to log sightings, see a
downloaded park map with their GPS position, and share a sighting phone to phone, all with no
network. The owner wants a good-looking prototype deployed quickly, and the earlier platform it
starts from is a set of Next.js web apps.

## Decision

Build the field app as an installable web app (Next.js, a service worker, IndexedDB, MapLibre) that
works fully offline once opened with a connection. Defer a native wrapper.

## Consequences

- One codebase for phones and desktops, deployable to Vercel from the existing repository, with no
  app-store review before anyone can try it.
- The service worker saves every screen and its files on install, so the app opens with no signal.
- **Cost: background GPS.** A web app cannot record a trip reliably with the screen off or the app
  in the background. Trips are recorded with the app open and a screen wake lock. If that proves
  unworkable on real phones, a native wrapper (for example Capacitor) becomes necessary.
- **Cost: storage eviction.** Browsers may clear site data under pressure; Safari clears it after
  seven days of no use unless the app is added to the home screen. The app asks for persistent
  storage and tells iPhone users to add it to the home screen.
- **Cost: camera scanning.** `BarcodeDetector` exists only in some browsers; a JavaScript decoder
  (jsQR) is the fallback.
