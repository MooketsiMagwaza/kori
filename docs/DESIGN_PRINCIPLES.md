# Design principles

How Kori looks and behaves, and the checklist every screen is held to before
it is merged. The values live in `shared/tokens.css`; this file says why.

## Who it is for, and where

Kori is used in an open vehicle, in a national park, on a phone, often in
full sun, sometimes at dusk, usually with one hand while the other holds
binoculars or a door frame. Mobile signal is usually absent. Everything else
follows from that.

- **Readable in bright sun.** Body text is blue-grey ink on a pale canvas
  (13.2:1 at the lowest, measured on the strongest corner of the wash).
  Secondary text never drops below 7:1 in Day, tertiary text never below
  4.5:1. No thin weights, no grey text on grey. Status is never shown by
  colour alone: every status chip has a word in it, and a selected species
  has a tick as well as a tint.
- **Big touch targets.** 48px minimum for anything you tap, 56px for the one
  main action on a screen. Tappable rows are full width. Map dots have a 40px
  tap area and merge before those areas touch.
- **Fewer things per screen.** One main action per screen, shown as the only
  filled (ink) button. Everything else is an outlined pill or a plain link.
- **Works with no signal, and says so.** The offline state is shown as a
  plain sentence ("No signal. Sightings are saved on this phone."), never as
  an error. The app never spins forever waiting for a network.
- **Day and Night.** Day is the default in daylight. Night is its own design,
  deep blue-green glass for dusk and for people who prefer it, not an
  inversion of Day, and it passes the same contrast checks.

## Direction: soft glass, in blue and green

The owner asked for Kori to carry the soft glass look of the owner's earlier
product (25 October 2026): a pale mint-white canvas with two faint washes (blue
top-left, mint bottom-right), translucent white surfaces with a white inner
edge and a soft blue-grey shadow, large corner radii, and pill buttons where
the one primary action is ink. This replaces Kori's earlier flat direction
(Kalahari sand, umber ink, burnt sienna), including its ban on gradients and
blur.

Glass is easy to overdo, so there are rules:

- **The only gradients are the two washes** on the canvas. Never on buttons,
  text, icons or the map.
- **Blur is for things that float over other content**: the top bar and dock,
  the rail, map panels and controls, map labels, a sticky console bar, the Day
  and Night button. In-flow cards are translucent but not blurred, which keeps
  low-end Android phones smooth.
- **Anything over text uses `--c-glass`** (blurred) **or `--c-surface-solid`**
  (menus, dialogs), never the translucent `--c-surface`.
- **Fallbacks are in the tokens.** With `prefers-reduced-transparency`, or in
  a browser with no `backdrop-filter`, surfaces become solid. With
  `prefers-reduced-motion`, durations are zero. In forced-colours mode,
  surfaces get a real border.
- **The wash sits on a fixed layer** (`body::before`) so it stays still as the
  page scrolls, on every phone.
- **Contrast is measured on the translucent surfaces**, not on the token
  values. `node scripts/check-contrast.mjs` composites every surface over the
  canvas and the map, in Day, in Night and with reduced transparency, and CI
  fails if a pair drops below AA. The figures are in the token file header.
- **Hidden things do not cast shadows.** The skip link is parked above the
  screen until it is focused; its shadow is drawn only on focus, because a
  32px blur otherwise reaches back into the top-left corner of every screen.

## Identity

Kori keeps its own identity inside that look.

- **Colour.** Blue and green. Deep teal-blue for links and selection, ink for
  the one primary action, Kori green (the mark, "sample data", approved,
  sighting areas) for the brand. Amber ("waiting") and red ("rejected",
  "sensitive", safety) stay as signals only, never as decoration. Map colours
  are a separate set (mint land, pale blue water, ink tracks) and never used
  for buttons.
- **Type.** Titles use Zilla Slab, a slab serif that reads like the painted
  signs at park gates. Everything you read for meaning uses the phone's own
  system font, so nothing is downloaded and every script renders.
- **Mark.** A kori bustard in profile, drawn for Kori, filled with the
  brand green; its eye is the solid surface colour.
- **Voice.** Short, plain sentences that name the real thing: the species,
  the time, the track, the cell. No "seamless", "unlock" or "supercharge".

## The top bar and the Day and Night switch

The bars carry navigation and status, not settings (changed 25 October 2026,
at the owner's request).

- **What is in a bar.** The field app's top bar holds the logo and the
  connection status; the console bar and the docs bar hold the name and the
  navigation; the landing header holds the logo, the sections and one button.
  The Day and Night switch is never in a bar.
- **The switch is a small floating round button**: 48px, glass (`--c-glass`,
  blurred, `--sh-2`), a sun in Day and a moon in Night, shown by CSS from
  `[data-theme]` so the icon is right on first paint. Its accessible name is
  constant ("Night colours") and `aria-pressed` says whether Night is on. The
  choice is stored (`kori-theme`) and applied by a script in `<head>` before
  the first paint, so there is no flash of the wrong theme. It keeps clear of
  the safe-area insets, and its transitions are off under reduced motion. The
  code is `shared/theme-toggle.tsx` and `shared/chrome.css`.
- **Where it floats.** Bottom right on the landing site, the review console and
  the API docs. In the field app it is at the bottom left: just above the dock
  on a phone and just right of the rail on a wide screen, because the map's own
  buttons (position, layers, whole reserve) are at the bottom right. Pages
  leave room beneath their last row so it never covers content at the end.
- **It covers nothing.** On the map page the scale bar and the "Demo data" row
  sit beside it, and sheets (key, route, about) sit above it. On screens with
  text fields (log a sighting, scan a code) it is placed in the flow at the end
  of the page instead of floating, so it can never sit over a field.

## The map

The park map is drawn from the downloaded pack, with no tiles.

- **Style.** `shared/map-style.ts` holds the layers as data; every colour is a
  `--m-*` token, read when the layers are added and again when Day and Night
  switch. Pale blue water, mint land inside the reserve, a cooler grey-mint
  outside it, ink tracks (lighter teal for GPS-confirmed, dashed grey-teal for
  predicted), green sighting areas, red dashed areas for sensitive species,
  a blue route on a white casing.
- **Sightings are small dots, not text pills.** A dot marks the middle of the
  published area, never the animal; a sensitive species is a dashed ring, not
  only a different colour. The area itself is drawn as the 1 km (or 10 km)
  square.
- **No piles.** Dots that would touch merge into one numbered cluster; tapping
  it zooms in. A name is written only beside the selected pin, the guidance
  target, the pin nearest you, and, once zoomed in, pins whose name fits in
  the clear part of the map without covering another name or marker
  (`shared/map-markers.ts`, tested).
- **Glass over the map** is `--c-glass` with blur, with ink text, and the
  contrast script checks it over every map area. On phones the map runs under
  the floating dock, so its controls and sheets are offset to clear it.
- **The map fills the screen.** Nothing over it is bigger than a one-line chip.
  While there is no pack on the phone, one slim chip near the top reads "No
  park pack" beside the button "Download the sample pack"; it is gone once the
  pack is downloaded. The bottom left is one slim row, beside the Day and Night
  button: the "Demo data" chip, "Pack 18 KB" once there is a pack, and the (i)
  that opens "About this map" with the warning that the sample reserve is
  fictional and must not be navigated by. The map's buttons are at the bottom
  right.

## Safety and honesty are part of the design

- **Sample data is labelled, quietly, and the truth is one tap away.** A small
  neutral "Demo data" chip sits in the landing footer, in the map's attribution
  row and on sighting pages, and links to "About the demo data" (the Status
  section of the landing site, the About page of the field app), which says
  plainly that the reserve, the sightings, the observers and the reviews are
  invented, that the backend is built but the apps do not call it yet, and
  that the fictional reserve's tracks do not match the ground. It never takes
  space over the map and is not a banner in a hero (changed 25 October 2026,
  because loud notices made a working prototype look fabricated). Lists of
  sightings keep their small dashed note, and the warning "do not navigate by
  it" stays in the map's (i) panel and on the Offline and packs page.
- **Predicted is drawn differently.** Anything predicted (a track from
  imagery, a likelihood) is dashed and muted, labelled "Predicted, not
  verified", and shows its confidence. It is never the default.
- **Coarse is drawn as an area.** A sighting is shown as a grid cell, never
  a pin on an exact spot. Sensitive species are a larger cell, later.
- **Guidance stays on tracks.** Routes are drawn only along known tracks. The
  app never draws a straight line across country to an animal.

See `docs/SAFETY_AND_PRIVACY.md` for the rules themselves.

## Checklist

Run it on every new screen, on a phone and on a desktop, in Day and Night.

### Type
- [ ] Titles use the display face; reading text uses the system face.
- [ ] Sentence case. No all-caps labels or letter-spaced kickers.
- [ ] Regular, medium and one bold. Hierarchy comes from size and weight.

### Colour
- [ ] No hard-coded colour in a component: only tokens (`--c-*`, `--m-*`, `--qr-*`).
- [ ] The only gradients are the two canvas washes. No glow, no neon.
- [ ] Every colour has a job (act, link and select, brand, state, map data).
- [ ] `node scripts/check-contrast.mjs` passes; status has a word, not only a colour.

### Surfaces
- [ ] Translucent with a white inner edge and a soft shadow; large radii (16 to 30px).
- [ ] Blur only on things that float over other content; solid under reduced transparency.
- [ ] No glass stacked on glass more than one layer deep; no cards inside cards.

### Layout
- [ ] The Day and Night switch is the floating round button, never in a bar; it covers no control, field, scale bar, attribution row or dock.
- [ ] One filled (ink) button per screen; buttons and chips are pills.
- [ ] Touch targets 48px or more; the main action 56px.
- [ ] No row of identical icon cards, no stat banner of giant numbers, no carousels.
- [ ] Data goes in lists and tables, with the number beside what it describes.
- [ ] Nothing overflows sideways from 305px to 1440px wide.

### Map
- [ ] Sightings are dots or rings, clustered when they would touch; names only when selected, nearby or room allows.
- [ ] Anything floating over the map is glass with ink text; controls clear the dock.
- [ ] Nothing over the map is bigger than a one-line chip; the Day and Night button, scale bar, "Demo data" row and sheets do not overlap.

### Motion
- [ ] 150 to 200ms, eased, explaining a change. Nothing pulses or bounces.
- [ ] `prefers-reduced-motion` turns transitions off (the tokens set the duration to 0).

### Accessibility
- [ ] Every page has one `h1`, a skip link and landmarks.
- [ ] Focus is always visible (3px ring in the focus colour).
- [ ] Icons that carry meaning have text beside them or an accessible name.
- [ ] Forms have visible labels, not placeholder-only fields.
- [ ] Hidden things (skip link, off-screen panels) cast no visible shadow.

### Honesty
- [ ] Sample data is labelled where it appears: the neutral "Demo data" chip (landing footer, map attribution row, sighting pages) links to "About the demo data"; no banner in a hero or over the map.
- [ ] The warning "do not navigate by it" stays in the map's (i) panel and on the Offline and packs page.
- [ ] Nothing claims to sync, send or verify when it does not.
- [ ] Predicted features are labelled predicted, with confidence.

## Where this came from

The structure of the token file, the sync tooling and the checklist format
started from the owner's earlier product, and the soft glass values and the
rules for using glass come from that product's design (see `PROVENANCE.md`).
Kori's brand green, map palette, map markers, type, mark, voice and the
field-use rules above are new for Kori.
