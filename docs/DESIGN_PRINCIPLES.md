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
  the rail, map panels and controls, map labels, a sticky console bar. In-flow
  cards are translucent but not blurred, which keeps low-end Android phones
  smooth.
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
  the floating dock, so its controls and notices are offset to clear it.

## Safety and honesty are part of the design

- **Sample data is labelled where it appears**, not only in a footer, with a
  dashed green note.
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
- [ ] One filled (ink) button per screen; buttons and chips are pills.
- [ ] Touch targets 48px or more; the main action 56px.
- [ ] No row of identical icon cards, no stat banner of giant numbers, no carousels.
- [ ] Data goes in lists and tables, with the number beside what it describes.
- [ ] Nothing overflows sideways from 305px to 1440px wide.

### Map
- [ ] Sightings are dots or rings, clustered when they would touch; names only when selected, nearby or room allows.
- [ ] Anything floating over the map is glass with ink text; controls clear the dock.

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
- [ ] Sample data says it is sample data on the screen where it appears.
- [ ] Nothing claims to sync, send or verify when it does not.
- [ ] Predicted features are labelled predicted, with confidence.

## Where this came from

The structure of the token file, the sync tooling and the checklist format
started from the owner's earlier product, and the soft glass values and the
rules for using glass come from that product's design (see `PROVENANCE.md`).
Kori's brand green, map palette, map markers, type, mark, voice and the
field-use rules above are new for Kori.
