# Design principles

How Kori looks and behaves, and the checklist every screen is held to before
it is merged. The values live in `shared/tokens.css`; this file says why.

## Who it is for, and where

Kori is used in an open vehicle, in a national park, on a phone, often in
full sun, sometimes at dusk, usually with one hand while the other holds
binoculars or a door frame. Mobile signal is usually absent. Everything else
follows from that.

- **Readable in bright sun.** Body text is near-black umber on pale sand
  (15.8:1). Secondary text never drops below 6:1. No thin weights, no grey
  text on grey. Status is never shown by colour alone: every status chip has
  a word in it.
- **Big touch targets.** 48px minimum for anything you tap, 56px for the one
  main action on a screen. Tappable rows are full width.
- **Fewer things per screen.** One main action per screen, shown as the only
  filled button. Everything else is outlined or a plain link.
- **Works with no signal, and says so.** The offline state is shown as a
  plain sentence ("No signal. Sightings are saved on this phone."), never as
  an error. The app never spins forever waiting for a network.
- **Day and Night.** Day is the default in daylight. Night is a warm
  charcoal for dusk and for people who prefer it; it is not a "cool" mode and
  it passes the same contrast checks.

## Identity

Kori's identity is its own: earthy and warm.

- **Colour.** Kalahari sand for the canvas, umber for ink, one burnt sienna
  for actions, ochre for the kori bustard mark, acacia green for "approved",
  amber for "waiting", and red for "rejected" and "sensitive". Map colours are
  a separate set (land, pan, water, tracks) and never used for buttons.
- **Type.** Titles use Zilla Slab, a slab serif that reads like the painted
  signs at park gates. Everything you read for meaning uses the phone's own
  system font, so nothing is downloaded and every script renders.
- **Mark.** A kori bustard in profile, drawn for Kori, filled with the
  surrounding text colour.
- **Voice.** Short, plain sentences that name the real thing: the species,
  the time, the track, the cell. No "seamless", "unlock" or "supercharge".

## Safety and honesty are part of the design

- **Sample data is labelled where it appears**, not only in a footer.
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
- [ ] No gradients, glows or blur. Flat fills.
- [ ] Every colour has a job (act, brand, state, map data).
- [ ] Contrast meets WCAG AA in Day and Night; status has a word, not only a colour.

### Layout
- [ ] One filled button per screen.
- [ ] Touch targets 48px or more; the main action 56px.
- [ ] No row of identical icon cards, no stat banner of giant numbers, no carousels.
- [ ] No cards inside cards. Separate surfaces with a 1px line; shadows only for things that float.
- [ ] Data goes in lists and tables, with the number beside what it describes.

### Motion
- [ ] 150 to 200ms, eased, explaining a change. Nothing pulses or bounces.
- [ ] `prefers-reduced-motion` turns transitions off (the tokens set the duration to 0).

### Accessibility
- [ ] Every page has one `h1`, a skip link and landmarks.
- [ ] Focus is always visible (2px ring in the focus colour).
- [ ] Icons that carry meaning have text beside them or an accessible name.
- [ ] Forms have visible labels, not placeholder-only fields.

### Honesty
- [ ] Sample data says it is sample data on the screen where it appears.
- [ ] Nothing claims to sync, send or verify when it does not.
- [ ] Predicted features are labelled predicted, with confidence.

## Where this came from

The structure of the token file, the sync tooling and the checklist format
started from the owner's earlier product (see `PROVENANCE.md`). The palette,
type, mark, voice and the field-use rules above are new for Kori.
