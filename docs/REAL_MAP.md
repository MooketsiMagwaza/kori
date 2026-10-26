# A real map for Kori (KO-25)

Status, 26 October 2026: **built for private use, and proven offline in headless Edge.** The owner's
Savuti pack exists only on the owner's machine (and, once downloaded, in a browser's own storage).
Nothing of it is in this repository or in any build. A real phone has not been tried yet.

## Why

The map in the field app drew a fictional reserve. It proved the offline pack, the routing and the
safety rules, but it did not look or feel like a real safari app. The owner asked for "an actual
map, not all the fake illustrations", with OpenStreetMap places and satellite imagery where it
helps, and wanted to see it working.

## What the owner decided (25 October 2026)

- **Area:** Savuti, Chobe National Park, **private use only.** The pack stays on the owner's
  machine and phone; never committed, never in a deployed build, never published. Covering a real
  park publicly waits for DWNP (KO-09, KO-14). With no real pack, the app uses the sample reserve
  exactly as before.
- **Downloads approved, with limits:** the `pmtiles` tool (verified against the release's
  checksum); an OpenStreetMap-derived extract of the window (stop above about 100 MB); Sentinel-2
  windows from the public AWS bucket through Earth Search, about 100 MB. Not approved without
  asking: Planetiler, tippecanoe, GDAL system installs, Copernicus DEM tiles, any other binary. None
  of those was used.
- **Map taps:** one tap on a lone sighting dot opens the sighting; a tap on a cluster zooms in; a
  long press on a dot shows a preview card (name, time, area, "Open").

## What was built

### The pack (`tools/map-pack/`, scripts only)

A pack is a folder of five files, built outside the repository
(`kori-research/real-map/packs/savuti/`), with a build log beside them:

| File | What | Bytes | Source and date | Licence |
| --- | --- | ---: | --- | --- |
| `base.pmtiles` | Vector base map, zooms 0 to 15, 1,459 tiles | 1,146,927 | `pmtiles extract` of the Protomaps daily build `20261025.pmtiles` (schema v4.15.2, OSM replication 2026-10-25 04:00 UTC); 54 range requests, 1.2 MB transferred | ODbL 1.0 (Protomaps: an ODbL Produced Work, OpenStreetMap attribution required; hotlinking discouraged, so the region was extracted once) |
| `imagery.pmtiles` | Sentinel-2 true colour, 594 WebP tiles of 256 px, zooms 8 to 14 | 8,250,961 | Scene `S2B_34KHE_20250802_0_L2A` (2 August 2025, 08:45 UTC, cloud 0.001%), bands 4-3-2 at 10 m and SCL at 20 m, read from the AWS bucket through Earth Search: 86.1 MB in 609 range requests | Copernicus Sentinel data, free with "Contains modified Copernicus Sentinel data 2025" |
| `graph.json` | The routable track graph in the app's `Reserve` format | 529,646 | Overpass API, OSM data as of 2026-10-26 00:58 UTC | ODbL 1.0 |
| `sightings.json` | Positions for the 24 sample sightings | 10,921 | Generated (`place-sightings.ts`) | Kori sample data |
| `manifest.json` | Sizes, SHA-256, sources and dates, licences, credits, timings | 6,618 | Generated (`build.py`) | |
| **Total the phone downloads** | | **9,938,455** (9.5 MiB) | | |

The window: west 23.95, south -18.76, east 24.47, north -18.29 (about 55 by 52 km: the imagery
check's 41 km square plus about 5 km all round). The imagery covers x 810220 to 861420 and
y 7928340 to 7969300 in UTM 34S (51.2 by 41.0 km): the 41 km square plus one 10 km column of
Sentinel-2 blocks to the west, so Savuti camp is not at its edge. That is exactly 20 whole blocks
per band. North and south of it, the margin has the vector map only.

The steps, in order (each download into its own new, empty folder; Python run with `-I`):

| Step | Command | Time, 26 Oct 2026 |
| --- | --- | ---: |
| Vector extract | `pmtiles extract https://build.protomaps.com/20261025.pmtiles base.pmtiles --bbox=23.95,-18.76,24.47,-18.29` | 33 s |
| OSM for the graph, places, water, the park boundary | `fetch_osm.py --bbox -18.76,23.95,-18.29,24.47 --out-dir <new folder>` (1.1 MB and 5.6 MB of JSON) | 88 s + 327 s (three Overpass 502s and retries) |
| Sentinel-2 window | `fetch_s2.py --item S2B_34KHE_20250802_0_L2A --utm-window 810220,7928340,861420,7969300 --out-dir <new folder> --budget-mb 100` (adds up the blocks first, stops above the budget) | 306 s |
| Graph | `build_graph.py` | 5 s |
| Sample sightings | `place-sightings.ts` | 0.3 s |
| Imagery tiles | `build_imagery.py` (stretch, pyramid, reprojection, WebP, MBTiles with `sqlite3`) | 62 s |
| To PMTiles, and verify | `pmtiles convert`, `pmtiles verify` | 0.5 s |
| The whole build (`build.py`, after the downloads) | | 68 s |

The `pmtiles` tool is v1.31.2 for Windows x86_64 from the official `protomaps/go-pmtiles` release.
Its SHA-256 matched the digest GitHub publishes for that asset (the release has no separate
checksums file). rasterio's own HTTP client could not verify certificates here (Windows schannel
could not reach a revocation server), so `fetch_s2.py` gives rasterio a range-request file opener
built on `requests`, which verifies certificates with OpenSSL and certifi; GDAL still decodes the
blocks.

**The track graph.** 403 OSM ways (363 `track`, 35 `unclassified`, 5 `service`) cut where they leave
the window and split at every shared vertex: 939 edges, 661 junctions, 649.5 km (439.6 km of track,
209.2 km of unclassified road), one connected network. Every edge has status `osm`, source `osm`,
its way id and its `highway`, `surface`, `tracktype`, `smoothness` and `name`, and is labelled
**"OSM, not verified"** until a GPS trip confirms it. Left out: 5 paths and 1 footway (not for
vehicles; the base map still draws them; one of the paths is also marked private). One way is named
"Avoid this road" in OSM: its three edges carry `caution` and cost four times as much to route over.
Gates: Savuti Gate (the route start when you are outside the park) and Ghoha Gate. The park
boundary is OSM's Chobe National Park relation clipped to the window (82% of it). No predicted
tracks.

**The sample sightings.** The app's 24 sample sightings (16 of them are on the map at any time
under the publication rules; the brief said 14) keep their species, counts, times and sensitivity.
Only their positions move: each is the middle of a 1 km area (`cellFor`), within 800 m of a
routable track, inside the park and the imagery, outside every OSM water polygon and at least
150 m from rivers and streams, picked in proportion to track length so they do not all crowd the
camps. **Rhino:** no known rhino area is in the window to my knowledge, but nothing is assumed:
the window has a pan called "Rhino Vlei" and a guides' campsite named after it, about 8 km
south-east of Savuti camp. A name is not evidence, but every published area keeps at least 5 km
clear of anything named after rhino (the distance to the area's middle must exceed half its
diagonal plus 5 km: 5.7 km for 1 km areas, 12.1 km for 10 km areas); the nearest is 5.9 km.
Other exclusion areas can be passed with `--exclude` (never committed). The owner should confirm
with DWNP that there is no rhino area here.

### The field app

- **Getting a pack onto the phone.** `/packs/local` lists, and `/packs/local/<pack>/<file>` serves,
  the packs in the folder named by `KORI_LOCAL_PACKS_DIR` on the machine running the app: only the
  five pack files, only for a pack id of lowercase letters, digits and dashes, 404 for anything
  else, and 404 for everything when the variable is unset (every deployed build). Offline and packs
  shows the pack with a progress bar; the map's slim chip says "Download the Savuti pack" when the
  computer offers one and no real pack is on the phone, and keeps "Download the sample pack"
  otherwise.
- **Storage.** The PMTiles files go into the origin private file system (OPFS) where the browser can
  write files there, otherwise into IndexedDB as Blobs; the graph and sample positions go into
  IndexedDB. Each file's size and SHA-256 are checked against the manifest. Writing is all or
  nothing (OPFS keeps the old contents until the stream closes; the Blob is stored only when
  complete); a failed or partial download is removed, a quota error gets a plain message, the room
  is checked first with `navigator.storage.estimate()`, persistence is requested after, and deleting
  a pack removes every file. An unfinished download shows "Download did not finish" with Get and
  Delete, and is never drawn.
- **Drawing it.** MapLibre reads the stored files through the `pmtiles://` protocol and a small
  `BlobSource` (`lib/pack-files.ts`), which answers each range with `Blob.slice`: no network. The
  style (`shared/map-style.ts`) is written on the Protomaps v4 schema and reads only Kori's tokens:
  pale blue water, mint park, ink OSM tracks on a halo casing, a dashed park edge, Noto Sans labels
  on a halo (camps, gates, hills, pans, the Savuti Channel, road names from zoom 13). Labels draw
  from font files in the app (`public/map-fonts`, copied from `@fontsource/noto-sans` at build time
  and saved by the service worker) through MapLibre's `font-faces`, so they need no glyph server.
- **Satellite.** A switch in the layers sheet ("Sentinel-2, 2 August 2025, 10 m pixels. Context
  only") puts the imagery under the tracks, labels and sightings; base-map roads hide, the park and
  water fills stay so the map is not blank past the imagery's edge; at night the imagery is dimmed
  to 80%.
- **Credits on screen.** The bottom row shows "© OpenStreetMap contributors" whenever a real pack is
  drawn and "Contains modified Copernicus Sentinel data 2025" while the imagery is on (wrapping onto
  a second line rather than being cut). The (i) panel and the About page ("Credits and data
  licences") say that anything derived from OSM is ODbL. The Demo data chip and the floating theme
  button stay.
- **Routing and guidance** run on the real graph with the same code (now with a binary heap, and
  cached per graph and inputs); the route sheet says "Tracks: OSM, not verified" and warns when a
  route uses a track OSM says to avoid.
- **Taps** (`pressOutcome` in `shared/map-markers.ts`, with tests): one tap on a lone dot opens its
  sighting; a hold of 500 ms, a right click or the menu key shows the preview card; a cluster
  zooms; a press that moved more than 10 px was a pan and does nothing.
- Other screens follow the active pack: the home page, the log page's demo spot ("beside a track at
  Savuti") and the small cell drawings.

## The offline proof

`node tools/map-pack/offline-proof.mjs --base http://localhost:3105 --pack savuti --out <shots>`,
against the production build served with `KORI_LOCAL_PACKS_DIR` on 127.0.0.1, in a fresh headless
Edge profile driven over the DevTools Protocol. Result on 26 October 2026: **13 of 13 checks
passed** (`kori-research/real-map/shots/proof.json`).

1. Online, Offline and packs listed the Savuti pack; Get stored `base.pmtiles` (1,146,927 bytes) and
   `imagery.pmtiles` (8,250,961 bytes) in the browser's OPFS (0.2 to 8 s from localhost). The
   service worker took control.
2. The network was cut on the page and on the service worker
   (`Network.emulateNetworkConditions`, offline); `navigator.onLine` was false and the header showed
   "No signal".
3. The map reloaded from the service worker and drew the stored base map and **697 OSM track
   features**; "© OpenStreetMap contributors", the Demo data chip and the theme button were on
   screen.
4. The satellite switch drew the stored imagery, and the credit row then read "© OpenStreetMap
   contributors · Contains modified Copernicus Sentinel data 2025".
5. A route to the sample wild dog area ran **5.1 km along OSM tracks** (47 vertices) from the
   emulated GPS position near Savuti Gate (`Emulation.setGeolocationOverride`), and the sheet said
   "OSM, not verified".
6. A sighting logged with that GPS position was saved and appeared on the map (16 dots to 17).
7. One tap on a lone dot opened its sighting page.
8. **Every one of 942 requests went to the app's own origin; none to another host.** Of the 645
   requests made while offline, 329 were answered by the service worker, 159 failed (as they
   should, for example the pack list and Next's prefetches) and **none was served by the network**.

Screenshots (phone 390 x 844 at 2x and desktop 1440 x 900, Day and Night, all taken offline) are in
`kori-research/real-map/shots/`. They show the private pack, so they are not in this repository
and must not be posted.

## How the satellite layer looks at each zoom

The ground resolution is 10 m. At Savuti's latitude a 256 px tile is 145 m a pixel at zoom 10,
36 m at zoom 12, 18 m at zoom 13 and 9 m at zoom 14.

- **Zooms 8 to 12:** like a sharp aerial photograph: the Savuti Marsh, the dark mopane woodland,
  the pans, the line of the channel, burn scars.
- **Zoom 13:** still good. The Savuti Channel, the Gubatsa kopjes, the airstrip and the wide sand
  roads are clear; ordinary tracks mostly are not.
- **Zoom 14:** the native 10 m. Soft: single trees are dots, and most tracks a few metres wide are
  narrower than a pixel and do not show, as the imagery check found (16 of 50).
- **Zoom 15 and closer:** MapLibre enlarges the zoom 14 tiles, so the picture is blurred blocks
  with a faint seam between some tiles; the OSM tracks and labels drawn on top stay crisp. This is
  the free 10 m limit. Sharper imagery would mean a commercial source and its own terms.

The stretch: per band, the 1% low is subtracted (haze is strongest in blue), then each band is
divided by a range halfway between the widest band's and its own, with a 0.9 gamma. Keeping the
true reflectance ratios made dry-season Savuti look orange on screen; balancing every band fully
made it mauve; halfway reads as tan sand and grey-green woodland.

## What looked wrong, and what was done

- First offline run, phone: the whole 55 km window fitted on the screen, leaving the imagery as a
  small rectangle on an empty background, because the vector fills were hidden in satellite mode.
  **Fixed:** a real pack opens covering the screen, and the fills stay on under the imagery.
- The two credits wrapped to five lines in a narrow column. **Fixed:** they take their own line in
  the bottom pill (two lines on a phone with the imagery on).
- The first screenshots came out in Night because headless Edge reports a dark system theme.
  **Fixed in the proof:** Day is set explicitly.
- Contrast: base-map roads on water (2.83:1) and the park edge over the lightest imagery (2.96:1)
  were under 3:1. **Fixed** by darkening `--m-road` and `--m-boundary`. The contrast check now
  measures 220 pairs, including every line and label drawn over the satellite layer against the
  imagery's measured darkest, middle and lightest colours; all pass.
- The route sheet on a phone covers about half the map and hides most of the route; its note was
  shortened. The sheet's size is the existing design and needs the owner's eye.
- Sighting areas (1 km squares) overlap at Savuti, where several sample sightings fall in
  neighbouring squares, and at zoom 10 the clusters cover some of them. Accepted for sample data.
- Still visible: a faint seam between some zoom 14 imagery tiles when enlarged (zoom 15 and
  closer); labels are hidden below zoom 11, where the window is too crowded for them.

## Seeing it

**On the owner's machine** (PowerShell, from the repository):

```
cd apps/field
npm ci
npm run build
$env:KORI_LOCAL_PACKS_DIR = "C:\Users\Nido\Desktop\Projects\Active\kori-research\real-map\packs"
npx next start -H 127.0.0.1 -p 3105
```

Open `http://localhost:3105/offline`, press Get on "Savuti, Chobe National Park", then open the map.
Use `-H 127.0.0.1` so nobody else on the network (or the tailnet) can fetch the pack: plain
`next start` listens on every interface. To rebuild the pack, run the steps in the table above
with the paths under `kori-research/real-map/`.

**On the phone.** Geolocation, OPFS and the service worker need a secure origin: `https://` or
`localhost`. Two ways, both without publishing anything; neither has been tried with a phone yet:

1. **USB, with `adb reverse`** (checked: `adb` is installed at
   `C:\Users\Nido\AppData\Local\Android\Sdk\platform-tools\adb.exe`, not on the PATH). Turn on USB
   debugging on the Android phone, connect it, run `adb reverse tcp:3105 tcp:3105`, and open
   `http://localhost:3105` in Chrome on the phone. To the phone it is `localhost`, so it counts as
   secure. Download the pack, then switch on flight mode and use the map.
2. **Tailscale serve** (checked, read-only: Tailscale 1.102.4 is running, this machine is
   `nido.tail10c51a.ts.net`, and the tailnet has HTTPS certificates enabled: `CertDomains` lists
   that name; there is no serve configuration, and nothing was turned on). Run
   `tailscale serve 3105` in a terminal (in the foreground it stops with Ctrl+C), open
   `https://nido.tail10c51a.ts.net` on the phone with the Tailscale app signed in to the same
   tailnet, download, then go offline. **Never use `tailscale funnel`**: that would publish the
   pack on the internet.

## Safety, privacy and licensing

- No live animal locations and no real sighting data: every sighting on the real map is sample
  data, labelled, positioned as above. The publication rules are unchanged.
- Guidance stays on the graph; tracks are shown as OSM, not as verified; no predicted tracks.
- "© OpenStreetMap contributors" on screen whenever a real pack is drawn; "Contains modified
  Copernicus Sentinel data 2025" whenever the imagery is on; the ODbL for anything derived from OSM
  stated in the (i) panel, on Offline and packs and in About. The repository's "all rights
  reserved" covers Kori's code, not the pack data.
- The pack is never committed: `git ls-files` lists no `.pmtiles`, `.mbtiles`, `.npy` or pack
  folder, `.gitignore` refuses them, and `build.py` refuses a pack folder inside the repository.
  The production build's `.next` folder holds no `.pmtiles` file and none of the pack's place names
  (scanned on 26 October 2026). The README's screenshots stay on the sample reserve: Savuti must not
  be published.

## Not checked

- A real phone: touch, the long press, OPFS and quota on Android and iOS, flight mode, sun glare,
  the frame rate on a low-end Android with the imagery on.
- A live GPS fix in the field (the proof emulated one), and guidance while moving.
- The service worker on a phone (it worked in headless Edge), and iOS Safari at all: OPFS writes
  from the page need a recent Safari; the IndexedDB fallback has not been exercised.
- A download interrupted half way on a real network (the code removes the partial pack; the proof
  ran complete downloads only).
- Whether the OSM tracks match the ground; nobody has driven them with Kori.

## Remaining risks

- **OSM quality.** Tracks may be missing, misplaced, closed or seasonal; of the 409 ways fetched,
  161 have no `tracktype` and 116 no `surface`. The app says "OSM, not verified" where it matters.
- **Imagery is soft** beyond zoom 13, and it is one date only (2 August 2025).
- **Memory and speed** on low-end phones with 9.4 MB of PMTiles and a 939-edge graph: unmeasured.
- **Terms.** Protomaps discourages hotlinking its daily builds; the extract was taken once and kept.
  A public pack would also need the ODbL's share-alike handled for the base map and graph.
- **Rhino.** The keep-clear rule rests on names in OSM; DWNP's own sensitive areas are unknown.

## Open questions for the owner

1. Is the 10 m Sentinel-2 look enough, or should a sharper commercial source be priced?
2. Should the route sheet be smaller on a phone so more of the route shows?
3. The phone test: USB (`adb reverse`) or Tailscale serve?
4. When to approach DWNP about covering a park publicly (KO-09, KO-14).
