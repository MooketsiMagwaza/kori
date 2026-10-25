# A real map for Kori (KO-25)

Status: planned, 25 October 2026. Nothing here is built. This page is the plan to think about; the owner wants to see the result working before deciding more.

## Why

The map in the field app draws a fictional reserve: its tracks, water and gates are generated and do not match any ground. It proves the offline pack, the routing and the safety rules, but it does not look or feel like a real safari app. The owner asked for an actual map, using the references and options already worked out, with satellite imagery where it helps.

## What a real map needs

1. **A base map of real places**: roads, tracks, water, boundaries, names.
2. **Satellite imagery** as an optional layer, for context and for the look.
3. **A track network that routing can use**: the real tracks and roads, as a graph.
4. **All of it offline**: a pack the phone downloads before the trip, drawn with no signal.
5. **Sightings kept honest**: real map, but the sightings on it stay sample data until real observers log real ones.

## Sources, and what we already know about them

| Need | Source | Licence and terms | What we know |
| --- | --- | --- | --- |
| Roads, tracks, water, names | OpenStreetMap | ODbL: credit "OpenStreetMap contributors"; shared data derived from it must stay ODbL | The imagery check found 354 `highway=track` ways (337.7 km) in the Savuti window of Chobe alone, many untyped; position accuracy is unknown |
| Satellite imagery | Sentinel-2 (Copernicus) | Free for any use with "Contains modified Copernicus Sentinel data [year]" | 10 m pixels, and the only open imagery that covers Botswana's parks. OpenAerialMap and Maxar Open Data had nothing there, and NICFI's terms do not fit. One cloud-free dry-season scene of Savuti was already read through the Earth Search catalogue (101.7 MB for a 41 km square, four bands) |
| Terrain (optional) | Copernicus DEM GLO-30 | Free with credit | 30 m; a hillshade would add depth, at a cost in size. Not checked yet |
| Google, Esri, Bing imagery | Their tile services | Their terms limit caching and offline use | Not used. Terms to be confirmed before anyone proposes it |

**What the imagery check taught us.** At 10 m a safari track a few metres wide is narrower than a pixel. Only wide sand roads and cutlines showed (16 of 50 sampled tracks visible). So imagery is **context** under the real OSM tracks, not a way to find tracks. The map must never imply the imagery shows every track.

## The options

### A. Base map, offline

| Option | How | Good | Costs |
| --- | --- | --- | --- |
| **A1. Vector tiles in a PMTiles file (recommended)** | Cut the park's region out of an OpenStreetMap-derived vector basemap (for example the Protomaps builds) into one `.pmtiles` file; MapLibre reads it through the PMTiles protocol | One static file, no tile server, small for a region, works with the existing MapLibre | Must confirm the current build source and its terms; a style has to be written or adapted; extracting needs the `pmtiles` tool |
| A2. Hosted vector tiles (OpenFreeMap, MapTiler, others) | Point MapLibre at a hosted style | Fastest to see something | Online only, so it does not meet the no-signal requirement; usage terms and cost vary |
| A3. Build our own tiles from an OSM extract | Geofabrik extract of Botswana, then Planetiler or tippecanoe to a PMTiles | Full control of what is drawn | More tooling and time; Botswana extract is modest in size |

### B. Imagery layer, offline

| Option | How | Good | Costs |
| --- | --- | --- | --- |
| **B1. Sentinel-2 true-colour raster pack (recommended)** | Cloud-free dry-season composite of the park, cut to raster tiles (zoom 8 to 13) and packed as raster PMTiles | Free, covers the parks, gives the satellite look | 10 m only, so it looks soft when zoomed in; a pack is tens of MB; cloud masking and a composite are real work |
| B2. A single Sentinel-2 scene without a composite | As B1 with one clear scene | Quicker | Patchy colour at scene edges; one date only |
| B3. Commercial or licensed imagery | A provider with offline rights | Sharper | Cost and terms; not assumed |

### C. Tracks for routing

The OSM tracks become the graph the phone routes over (junctions split, tags kept, source on every edge). The existing routing and the "tracks only" rule stay. Edges are labelled **OSM, not verified** until a GPS trip confirms them, which matches the label scheme already in the app. Predicted tracks stay off, as the imagery check recommends.

### D. Delivery to the phone

A pack is a small bundle: a vector `.pmtiles`, an optional raster `.pmtiles`, and the track graph. The phone downloads it into its own storage (the file system API the browser provides, or IndexedDB) and MapLibre reads it through a custom PMTiles source, so there is no network at view time. A service worker alone is not enough because PMTiles uses range requests; this needs checking on real phones. The current sample pack (18 KB) shows the mechanism works for drawn shapes.

## What to show first (the demo)

Aim: the owner sees it working, on a real map, offline.

1. **An area.** Two choices to make with the owner:
   - A **peri-urban or non-park area** (for example around Gaborone) for anything public. It carries no wildlife-location sensitivity.
   - A **park window** (the Savuti square already studied) for private development only. The pack stays on the owner's machine, because covering a real park publicly waits for DWNP (KO-09, KO-14).
2. **The pack:** an OSM vector `.pmtiles` for that area, plus a Sentinel-2 raster `.pmtiles` if it can be built in reasonable time, plus the OSM track graph.
3. **In the field app:** the real map replaces the fictional reserve, a satellite toggle, sample sightings placed on real ground and labelled sample, a route along real tracks, GPS position, and credits for OSM and Copernicus.
4. **Proof it is offline:** the pack is downloaded, then the browser is put in offline mode (and later a phone in flight mode) and the map, the route and a logged sighting still work.
5. **Evidence to record:** pack sizes, build time, frames per second on a mid phone if one is available, and what looked wrong.

## Safety, privacy and licensing (unchanged rules, restated)

- No live animal locations, and no real sighting data in the demo. Sample sightings sit on a real map but are labelled sample, and none is placed on a real rhino or pangolin site.
- Guidance stays on existing tracks; the map shows OSM tracks as OSM, not as verified.
- Attribution on the map and on the landing page: "OpenStreetMap contributors" and "Contains modified Copernicus Sentinel data [year]". Anything published from OSM data stays ODbL; the repository's "all rights reserved" code licence is unaffected, but the **data pack licence must be stated** next to it.
- A public deployment of a real park waits for DWNP.

## Downloads this would need (each needs the owner's approval, with size)

- The `pmtiles` command-line tool (a single binary from the Protomaps project's GitHub releases).
- An OSM-derived regional extract: either a regional cut of a Protomaps build or a Geofabrik Botswana extract (the extract is modest; the planet build is not downloaded whole).
- Sentinel-2 windows for the chosen area through the Earth Search catalogue: about 100 MB for a 41 km square.
- Possibly Planetiler or tippecanoe and GDAL tooling, and Copernicus DEM tiles for a hillshade, if those options are chosen.

## Estimate (a guess, to be replaced by measurements)

About 5 to 8 working days for the demo (pack pipeline 2 to 3; map style and field app changes 2 to 3; offline proof and checks 1 to 2). Real park packs and the graph builder for many parks are later work (KO-09).

## Risks

- **Imagery looks soft.** 10 m is the free limit. If the owner expects sharp satellite pictures, it will disappoint; commercial imagery is the alternative and has its own cost and terms.
- **Pack size and speed.** A region with raster tiles may be tens of MB; a low-end phone's frame rate is unmeasured.
- **PMTiles offline in a browser** needs a custom source and has not been tried on a real phone.
- **OSM quality.** Tracks may be missing, misplaced, or mis-tagged; the app must say so.
- **Terms.** The basemap build source and any imagery other than Sentinel-2 need their terms read before use.

## Open questions for the owner

1. Which area for the demo: a peri-urban area for something public, the Savuti window for private use, or both?
2. Is the Sentinel-2 satellite look at 10 m enough, or should a sharper (commercial) source be priced?
3. Opening a sighting from the map. The restyle made a tap on a map dot select it, and its name is the link, so opening takes two taps. Should a lone, unclustered dot open its sighting in one tap, with the selected-pin card kept for clusters?
4. Which downloads above may I make?
