/**
 * The park map's style, as data: layer order, widths, dashes and which token colours each paint
 * property. Nothing here is a hard-coded colour; the field app reads the `--m-*` tokens when it
 * adds the layers and again whenever Day and Night switch, so the map follows the theme.
 *
 * The look: pale blue water, mint land inside the reserve, a cooler grey-mint outside it, ink
 * tracks (lighter teal for GPS-confirmed, dashed grey-teal for predicted), green sighting areas
 * (red and dashed for sensitive species) and a blue route on a white casing.
 *
 * A real park pack adds a vector base map (an OpenStreetMap extract in the Protomaps v4 schema,
 * source "base") under these layers, an optional Sentinel-2 satellite layer (source "imagery"),
 * OSM tracks drawn in ink on a halo casing so they read over the imagery, and labels in Noto Sans
 * with a halo. See REAL_BASE_LAYERS, IMAGERY_LAYER and REAL_LABEL_LAYERS below.
 *
 * No maplibre-gl import on purpose: this file is copied into every app, and only the field app
 * has the library. The field app passes these definitions to `map.addLayer`.
 */

export const MAP_SOURCES = ["boundary", "pans", "river", "tracks", "cells", "route", "accuracy"] as const;

/** Sources a real park pack adds: the vector base map and the satellite imagery (both PMTiles). */
export const REAL_SOURCES = ["base", "imagery"] as const;

export type MapLayerDef = {
  id: string;
  type: "background" | "fill" | "line" | "symbol" | "raster";
  source?: (typeof MAP_SOURCES)[number] | (typeof REAL_SOURCES)[number];
  /** The layer inside a vector source ("roads", "water", ...). */
  sourceLayer?: string;
  filter?: unknown[];
  minzoom?: number;
  layout?: Record<string, unknown>;
  /** Paint properties that are not colours (widths, dashes, opacity). */
  paint: Record<string, unknown>;
  /** Paint properties that are colours, and the token each one reads. */
  colours: Record<string, string>;
  /** With the satellite layer on, this layer is hidden ("off") or shown only then ("on"). */
  satellite?: "on" | "off";
};

const width = (low: number, high: number) => ["interpolate", ["linear"], ["zoom"], 9, low, 14, high];

export const MAP_LAYERS: MapLayerDef[] = [
  { id: "bg", type: "background", paint: {}, colours: { "background-color": "--m-land-2" } },
  { id: "boundary-fill", type: "fill", source: "boundary", paint: {}, colours: { "fill-color": "--m-land" } },
  { id: "boundary-line", type: "line", source: "boundary", paint: { "line-width": 2, "line-dasharray": [4, 3] }, colours: { "line-color": "--m-boundary" } },
  { id: "pans-fill", type: "fill", source: "pans", paint: {}, colours: { "fill-color": "--m-pan" } },
  { id: "pans-line", type: "line", source: "pans", paint: { "line-width": 1.5 }, colours: { "line-color": "--m-water" } },
  { id: "river", type: "line", source: "river", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": width(2.5, 8) }, colours: { "line-color": "--m-river" } },
  {
    id: "tracks-predicted",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "predicted"],
    layout: { visibility: "none", "line-cap": "butt" },
    paint: { "line-width": width(1.5, 3.5), "line-dasharray": [2, 2] },
    colours: { "line-color": "--m-track-predicted" },
  },
  {
    id: "tracks-gps",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "gps"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": width(1.6, 4) },
    colours: { "line-color": "--m-track-gps" },
  },
  {
    id: "tracks-verified",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "verified"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": width(2, 5) },
    colours: { "line-color": "--m-track" },
  },
  // OpenStreetMap tracks in a real pack: ink on a halo casing, so they read on mint land and on the
  // satellite imagery alike. "OSM, not verified" in the key.
  {
    id: "tracks-osm-casing",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "osm"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": width(3.4, 7.5) },
    colours: { "line-color": "--m-halo" },
  },
  {
    id: "tracks-osm",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "osm"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": width(1.6, 4) },
    colours: { "line-color": "--m-track" },
  },
  { id: "cells-fill", type: "fill", source: "cells", filter: ["!", ["get", "sensitive"]], paint: { "fill-opacity": 0.2 }, colours: { "fill-color": "--m-cell" } },
  { id: "cells-sensitive-fill", type: "fill", source: "cells", filter: ["get", "sensitive"], paint: { "fill-opacity": 0.14 }, colours: { "fill-color": "--m-cell-sensitive" } },
  { id: "cells-line", type: "line", source: "cells", filter: ["!", ["get", "sensitive"]], paint: { "line-width": 2.5 }, colours: { "line-color": "--m-cell" } },
  {
    id: "cells-sensitive-line",
    type: "line",
    source: "cells",
    filter: ["get", "sensitive"],
    paint: { "line-width": 2.5, "line-dasharray": [3, 2] },
    colours: { "line-color": "--m-cell-sensitive" },
  },
  { id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 11 }, colours: { "line-color": "--m-halo" } },
  { id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 6 }, colours: { "line-color": "--m-route" } },
  { id: "accuracy", type: "fill", source: "accuracy", paint: { "fill-opacity": 0.15 }, colours: { "fill-color": "--m-me" } },
];

/** Layers that sit on the sighting areas, so one switch can show or hide them together. */
export const CELL_LAYER_IDS = MAP_LAYERS.filter((layer) => layer.id.startsWith("cells-")).map((layer) => layer.id);

/* ---------- a real park pack: the base map, the imagery and the labels ---------- */

const isLine = ["==", ["geometry-type"], "LineString"];
const isArea = ["==", ["geometry-type"], "Polygon"];
const named = ["has", "name"];

/**
 * The vector base map, drawn under the overlay layers above (between "bg" and "boundary-fill").
 * Fills and water stay on with the satellite layer: the imagery covers them where it has pixels,
 * and past the imagery's edge the vector map shows rather than an empty background. Roads and
 * paths hide, because the OSM tracks are drawn on their casing over the imagery anyway.
 * Kinds come from the Protomaps v4 schema as found in the Savuti extract
 * (tools/map-pack/inspect-pmtiles.mjs): landuse nature_reserve (the park and forest reserves),
 * wetland; water areas and river and stream lines; roads (minor_road, path, aeroway).
 */
export const REAL_BASE_LAYERS: MapLayerDef[] = [
  { id: "base-park", type: "fill", source: "base", sourceLayer: "landuse", filter: ["==", ["get", "kind"], "nature_reserve"], paint: {}, colours: { "fill-color": "--m-land" } },
  { id: "base-wetland", type: "fill", source: "base", sourceLayer: "landuse", filter: ["==", ["get", "kind"], "wetland"], paint: {}, colours: { "fill-color": "--m-wetland" } },
  { id: "base-water", type: "fill", source: "base", sourceLayer: "water", filter: isArea, paint: {}, colours: { "fill-color": "--m-pan" } },
  { id: "base-water-edge", type: "line", source: "base", sourceLayer: "water", filter: isArea, paint: { "line-width": 1 }, colours: { "line-color": "--m-water" } },
  {
    id: "base-river",
    type: "line",
    source: "base",
    sourceLayer: "water",
    filter: isLine,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": width(1.2, 4) },
    colours: { "line-color": "--m-river" },
  },
  // The park edge: dashed, on a halo so it shows on the imagery too.
  { id: "base-park-edge-casing", type: "line", source: "base", sourceLayer: "landuse", filter: ["==", ["get", "kind"], "nature_reserve"], paint: { "line-width": 4 }, colours: { "line-color": "--m-halo" }, satellite: "on" },
  { id: "base-park-edge", type: "line", source: "base", sourceLayer: "landuse", filter: ["==", ["get", "kind"], "nature_reserve"], paint: { "line-width": 1.6, "line-dasharray": [4, 3] }, colours: { "line-color": "--m-boundary" } },
  // Roads the graph does not carry (paths, the airstrip) and context beyond it; the routable tracks
  // are drawn over these by the "tracks-osm" overlay.
  {
    id: "base-paths",
    type: "line",
    source: "base",
    sourceLayer: "roads",
    filter: ["==", ["get", "kind"], "path"],
    minzoom: 12,
    paint: { "line-width": 1.2, "line-dasharray": [2, 2] },
    colours: { "line-color": "--m-road" },
    satellite: "off",
  },
  { id: "base-roads", type: "line", source: "base", sourceLayer: "roads", filter: ["in", ["get", "kind"], ["literal", ["minor_road", "major_road", "highway"]]], paint: { "line-width": width(1, 2.5) }, colours: { "line-color": "--m-road" }, satellite: "off" },
  { id: "base-runway", type: "line", source: "base", sourceLayer: "roads", filter: ["==", ["get", "kind"], "aeroway"], paint: { "line-width": width(2, 8) }, colours: { "line-color": "--m-road" }, satellite: "off" },
];

/** The Sentinel-2 satellite layer: under the tracks, labels and sightings, over the base fills. */
export const IMAGERY_LAYER: MapLayerDef = {
  id: "imagery",
  type: "raster",
  source: "imagery",
  layout: { visibility: "none" },
  paint: { "raster-fade-duration": 0, "raster-resampling": "linear" },
  colours: {},
  satellite: "on",
};

/** At night the imagery is dimmed to this share of its brightness, so it does not glare. */
export const IMAGERY_NIGHT_BRIGHTNESS = 0.8;

const text = (size: [number, number]) => ["interpolate", ["linear"], ["zoom"], 10, size[0], 15, size[1]];
const label = (font: string, size: [number, number], extra: Record<string, unknown> = {}) => ({
  "text-field": ["get", "name"],
  "text-font": [font],
  "text-size": text(size),
  "text-max-width": 9,
  "text-padding": 4,
  ...extra,
});
const halo = { "text-halo-width": 1.6, "text-halo-blur": 0.4 };

/** Names, on top of everything drawn by MapLibre (sighting dots are HTML markers above these). */
export const REAL_LABEL_LAYERS: MapLayerDef[] = [
  {
    id: "label-river",
    type: "symbol",
    source: "base",
    sourceLayer: "water",
    filter: ["all", isLine, named],
    minzoom: 11,
    layout: label("Noto Sans Italic", [11, 14], { "symbol-placement": "line", "symbol-spacing": 320 }),
    paint: halo,
    colours: { "text-color": "--m-label-water", "text-halo-color": "--m-halo" },
  },
  {
    id: "label-water",
    type: "symbol",
    source: "base",
    sourceLayer: "water",
    filter: ["all", isArea, named],
    minzoom: 12,
    layout: label("Noto Sans Italic", [11, 13]),
    paint: halo,
    colours: { "text-color": "--m-label-water", "text-halo-color": "--m-halo" },
  },
  {
    id: "label-road",
    type: "symbol",
    source: "base",
    sourceLayer: "roads",
    filter: named,
    minzoom: 13,
    layout: label("Noto Sans Regular", [11, 13], { "symbol-placement": "line", "symbol-spacing": 400 }),
    paint: halo,
    colours: { "text-color": "--m-label", "text-halo-color": "--m-halo" },
  },
  {
    id: "label-poi",
    type: "symbol",
    source: "base",
    sourceLayer: "pois",
    filter: ["all", named, ["in", ["get", "kind"], ["literal", ["camp_site", "hotel", "resort", "aerodrome", "attraction", "viewpoint", "peak", "rock", "picnic_site", "water", "wetland", "heath"]]]],
    minzoom: 11,
    layout: label("Noto Sans SemiBold", [11, 13], { "text-anchor": "top", "text-offset": [0, 0.4] }),
    paint: halo,
    colours: { "text-color": "--m-label", "text-halo-color": "--m-halo" },
  },
  {
    id: "label-place",
    type: "symbol",
    source: "base",
    sourceLayer: "places",
    filter: named,
    layout: label("Noto Sans SemiBold", [12, 15]),
    paint: halo,
    colours: { "text-color": "--m-label", "text-halo-color": "--m-halo" },
  },
];

/** Every layer a real pack adds, in drawing order groups. */
export const REAL_LAYERS: MapLayerDef[] = [...REAL_BASE_LAYERS, IMAGERY_LAYER, ...REAL_LABEL_LAYERS];

/**
 * The label fonts: Noto Sans (SIL Open Font License) from the @fontsource/noto-sans package,
 * copied into the field app's public/map-fonts at build time and saved by the service worker, so
 * labels draw with no network. MapLibre draws each glyph from the font file (`font-faces`).
 */
export function mapFontFaces(origin: string): Record<string, { url: string; "unicode-range": string[] }[]> {
  const face = (weight: string, style: string) => [
    { url: `${origin}/map-fonts/noto-sans-latin-${weight}-${style}.woff2`, "unicode-range": ["U+0000-00FF", "U+2000-206F", "U+20AC", "U+2122", "U+FEFF", "U+FFFD"] },
    { url: `${origin}/map-fonts/noto-sans-latin-ext-${weight}-${style}.woff2`, "unicode-range": ["U+0100-024F", "U+1E00-1EFF"] },
  ];
  return { "Noto Sans Regular": face("400", "normal"), "Noto Sans Italic": face("400", "italic"), "Noto Sans SemiBold": face("600", "normal") };
}

/** The font files `mapFontFaces` names, for the copy script and the service worker. */
export const MAP_FONT_FILES = ["400-normal", "400-italic", "600-normal"].flatMap((v) => [`noto-sans-latin-${v}.woff2`, `noto-sans-latin-ext-${v}.woff2`]);

/** A layer ready for `map.addLayer`, with each colour read from its token by `read`. */
export function resolveLayer(layer: MapLayerDef, read: (token: string) => string) {
  const paint: Record<string, unknown> = { ...layer.paint };
  for (const [property, token] of Object.entries(layer.colours)) paint[property] = read(token);
  const spec: Record<string, unknown> = { id: layer.id, type: layer.type, paint };
  if (layer.source) spec.source = layer.source;
  if (layer.sourceLayer) spec["source-layer"] = layer.sourceLayer;
  if (layer.filter) spec.filter = layer.filter;
  if (layer.minzoom !== undefined) spec.minzoom = layer.minzoom;
  if (layer.layout) spec.layout = layer.layout;
  return spec;
}

/** Every colour property in the style (sample and real layers), for repainting when the theme changes. */
export function colourBindings(): { layer: string; property: string; token: string }[] {
  return [...MAP_LAYERS, ...REAL_LAYERS].flatMap((layer) => Object.entries(layer.colours).map(([property, token]) => ({ layer: layer.id, property, token })));
}

/** Layers to show or hide when the satellite layer is switched. */
export function satelliteVisibility(on: boolean): { layer: string; visible: boolean }[] {
  return REAL_LAYERS.filter((layer) => layer.satellite).map((layer) => ({ layer: layer.id, visible: layer.satellite === "on" ? on : !on }));
}
