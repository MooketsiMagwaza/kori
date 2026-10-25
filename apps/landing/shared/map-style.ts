/**
 * The park map's style, as data: layer order, widths, dashes and which token colours each paint
 * property. Nothing here is a hard-coded colour; the field app reads the `--m-*` tokens when it
 * adds the layers and again whenever Day and Night switch, so the map follows the theme.
 *
 * The look: pale blue water, mint land inside the reserve, a cooler grey-mint outside it, ink
 * tracks (lighter teal for GPS-confirmed, dashed grey-teal for predicted), green sighting areas
 * (red and dashed for sensitive species) and a blue route on a white casing.
 *
 * No maplibre-gl import on purpose: this file is copied into every app, and only the field app
 * has the library. The field app passes these definitions to `map.addLayer`.
 */

export const MAP_SOURCES = ["boundary", "pans", "river", "tracks", "cells", "route", "accuracy"] as const;

export type MapLayerDef = {
  id: string;
  type: "background" | "fill" | "line";
  source?: (typeof MAP_SOURCES)[number];
  filter?: unknown[];
  layout?: Record<string, unknown>;
  /** Paint properties that are not colours (widths, dashes, opacity). */
  paint: Record<string, unknown>;
  /** Paint properties that are colours, and the token each one reads. */
  colours: Record<string, string>;
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

/** A layer ready for `map.addLayer`, with each colour read from its token by `read`. */
export function resolveLayer(layer: MapLayerDef, read: (token: string) => string) {
  const paint: Record<string, unknown> = { ...layer.paint };
  for (const [property, token] of Object.entries(layer.colours)) paint[property] = read(token);
  const spec: Record<string, unknown> = { id: layer.id, type: layer.type, paint };
  if (layer.source) spec.source = layer.source;
  if (layer.filter) spec.filter = layer.filter;
  if (layer.layout) spec.layout = layer.layout;
  return spec;
}

/** Every colour property in the style, for repainting when the theme changes. */
export function colourBindings(): { layer: string; property: string; token: string }[] {
  return MAP_LAYERS.flatMap((layer) => Object.entries(layer.colours).map(([property, token]) => ({ layer: layer.id, property, token })));
}
