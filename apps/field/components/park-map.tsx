"use client";

/**
 * The park map. Draws only what is stored on this phone: the active pack and the sightings list.
 * Nothing is fetched to draw it, so it works with no signal. Your position comes from the phone's
 * GPS, which needs no mobile signal either.
 *
 * Two kinds of pack:
 *   - the sample reserve (fictional, one GeoJSON file in IndexedDB), drawn as before;
 *   - a real park pack (private, from the computer serving the app): an OpenStreetMap vector base
 *     map and Sentinel-2 imagery as PMTiles files in the phone's storage, read by byte range through
 *     the pmtiles:// protocol, and the OSM track graph that routing uses. Tracks are labelled
 *     "OSM, not verified"; the satellite layer is in the layers sheet; credits are in the bottom row.
 *
 * Guidance (?to=<sighting id>) routes along tracks only, from your position if you are inside the
 * reserve, otherwise from the gate. Predicted tracks are hidden and left out of routing until you
 * switch them on, and they are always drawn dashed (the real pack has none).
 *
 * Tapping a sighting: one tap on a lone dot opens it; a long press shows a preview card with an
 * "Open" button; a numbered cluster zooms in (shared/map-markers.ts, pressOutcome).
 *
 * Chrome over the map is kept small so the map fills the screen: one slim chip at the top while there
 * is no pack, and one slim row at the bottom left (beside the Day and Night button) with a "Demo data"
 * link, the pack size or the map credits, and the (i) that opens the map's information, including the
 * warning that the sample reserve is fictional and must not be navigated by.
 */

import "@/lib/maplibre-setup";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LngLatBounds, Map as MapLibreMap, Marker, ScaleControl, type GeoJSONSource, type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import type { LonLat } from "@/shared/geo";
import { distanceMeters, distanceToPolylineMeters, formatDistance, metersToDegrees } from "@/shared/geo";
import {
  CELL_LAYER_IDS,
  IMAGERY_LAYER,
  IMAGERY_NIGHT_BRIGHTNESS,
  MAP_LAYERS,
  MAP_SOURCES,
  REAL_BASE_LAYERS,
  REAL_LABEL_LAYERS,
  REAL_LAYERS,
  REAL_SOURCES,
  colourBindings,
  mapFontFaces,
  resolveLayer,
  satelliteVisibility,
} from "@/shared/map-style";
import { circleBox, groupPins, labelBox, LONG_PRESS_MS, overlaps, placeLabels, pressOutcome, TAP_MOVE_PX, type Pin } from "@/shared/map-markers";
import { reserveGeoJSON, isInsideReserve, TRACK_STATUS_LABEL, type Reserve } from "@/shared/reserve";
import { routeAlongTracks, type RouteResult } from "@/shared/routing";
import { canGuide, cellRing, isPublic, sensitivityOf } from "@/shared/rules";
import type { Sighting } from "@/shared/sample-sightings";
import { speciesById } from "@/shared/species";
import { Icon } from "@/shared/icons";
import { DemoDataChip } from "@/components/bits";
import { getStore, type PackProgress, type RealPackRecord } from "@/lib/store";
import { registerPackFile } from "@/lib/pmtiles-setup";
import { formatBytes, relativeTime, useGeolocation, useNow, useStoreData } from "@/lib/hooks";
import { SAMPLE_RESERVE_ID } from "@/shared/reserve";

const EMPTY = { type: "FeatureCollection" as const, features: [] };

const OSM_CREDIT = "© OpenStreetMap contributors";
const SENTINEL_CREDIT = "Contains modified Copernicus Sentinel data 2025";

// Colours come from the design tokens (--m-*), read when the layers are added and again when the
// theme changes. There is no colour in this file.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const isNight = () => document.documentElement.getAttribute("data-theme") === "dark";

/** Add a real pack's sources and layers, reading its PMTiles files from this phone's storage. */
async function addRealPack(map: MapLibreMap, pack: RealPackRecord): Promise<boolean> {
  const store = getStore();
  const [base, imagery] = await Promise.all([store.packFile(pack.id, "base.pmtiles"), store.packFile(pack.id, "imagery.pmtiles")]);
  if (!base) return false;
  removeRealPack(map);
  const key = `kori-${pack.id}-${pack.version}-${Date.parse(pack.downloadedAt)}`;
  map.addSource("base", { type: "vector", url: registerPackFile(`${key}-base`, base), attribution: OSM_CREDIT });
  for (const layer of REAL_BASE_LAYERS) map.addLayer(resolveLayer(layer, cssVar) as unknown as LayerSpecification, "boundary-fill");
  if (imagery) {
    map.addSource("imagery", { type: "raster", url: registerPackFile(`${key}-imagery`, imagery), tileSize: 256, attribution: SENTINEL_CREDIT });
    map.addLayer(resolveLayer(IMAGERY_LAYER, cssVar) as unknown as LayerSpecification, "base-park-edge-casing");
  }
  for (const layer of REAL_LABEL_LAYERS) map.addLayer(resolveLayer(layer, cssVar) as unknown as LayerSpecification);
  return true;
}

function removeRealPack(map: MapLibreMap) {
  for (const layer of REAL_LAYERS) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
  for (const source of REAL_SOURCES) if (map.getSource(source)) map.removeSource(source);
}

/**
 * Follow presses on a marker and report what each should do (pressOutcome). A long press shows the
 * preview as soon as the hold is long enough, and the click that follows the release is swallowed. A
 * keyboard Enter or Space arrives as a click with no pointer, which counts as a tap.
 */
function watchPress(el: HTMLElement, target: "pin" | "cluster", act: (outcome: ReturnType<typeof pressOutcome>) => void) {
  let start: { x: number; y: number; t: number } | null = null;
  let moved = 0;
  let previewed = false;
  let timer = 0;
  const stopTimer = () => window.clearTimeout(timer);
  el.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY, t: performance.now() };
    moved = 0;
    previewed = false;
    stopTimer();
    if (target === "pin") {
      timer = window.setTimeout(() => {
        if (moved > TAP_MOVE_PX) return;
        previewed = true;
        act(pressOutcome(target, { heldMs: LONG_PRESS_MS, movedPx: moved }));
      }, LONG_PRESS_MS);
    }
  });
  el.addEventListener("pointermove", (event) => {
    if (!start) return;
    moved = Math.max(moved, Math.hypot(event.clientX - start.x, event.clientY - start.y));
    if (moved > TAP_MOVE_PX) stopTimer();
  });
  el.addEventListener("pointercancel", () => {
    stopTimer();
    start = null;
    act(pressOutcome(target, { heldMs: 0, movedPx: 0, cancelled: true }));
  });
  el.addEventListener("click", (event) => {
    stopTimer();
    event.preventDefault();
    event.stopPropagation();
    if (previewed) {
      previewed = false;
      start = null;
      return;
    }
    const press = start ? { heldMs: performance.now() - start.t, movedPx: moved } : { heldMs: 0, movedPx: 0 };
    start = null;
    act(pressOutcome(target, press));
  });
  el.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    stopTimer();
    if (target !== "pin") return;
    previewed = true;
    act(pressOutcome(target, { heldMs: 0, movedPx: 0, contextMenu: true }));
  });
}

// A real pack has hundreds of junctions, so a route is worked out once per graph, start, end and
// predicted-track setting, not on every render.
const routes = new WeakMap<Reserve, Map<string, RouteResult | null>>();
function cachedRoute(reserve: Reserve, from: LonLat, to: LonLat, includePredicted: boolean): RouteResult | null {
  let byKey = routes.get(reserve);
  if (!byKey) routes.set(reserve, (byKey = new Map()));
  const key = `${from.join(",")}|${to.join(",")}|${includePredicted}`;
  if (!byKey.has(key)) {
    if (byKey.size > 40) byKey.clear();
    byKey.set(key, routeAlongTracks(reserve, from, to, { includePredicted, minConfidence: "high" }));
  }
  return byKey.get(key) ?? null;
}

/**
 * Frame a real pack so it fills the clear part of the screen (cover) rather than fitting inside it
 * (contain): a pack's window is wider than a phone held upright, and fitting it would leave bands
 * of empty map above and below.
 */
function coverBounds(map: MapLibreMap, bounds: [number, number, number, number], padding: { top: number; bottom: number; left: number; right: number }) {
  const camera = map.cameraForBounds(bounds, { padding });
  if (!camera) return;
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const mx = (lon: number) => (lon + 180) / 360;
  const my = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  };
  const boundsAspect = (mx(bounds[2]) - mx(bounds[0])) / (my(bounds[1]) - my(bounds[3]));
  const screenAspect = Math.max(1, w - padding.left - padding.right) / Math.max(1, h - padding.top - padding.bottom);
  map.jumpTo({ center: camera.center, zoom: Math.min(13, (camera.zoom ?? 10) + Math.abs(Math.log2(boundsAspect / screenAspect))) });
}

function applySatellite(map: MapLibreMap, on: boolean) {
  for (const { layer, visible } of satelliteVisibility(on)) if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
  if (map.getLayer("imagery")) map.setPaintProperty("imagery", "raster-brightness-max", isNight() ? IMAGERY_NIGHT_BRIGHTNESS : 1);
}

function circle(centre: LonLat, radiusMeters: number): LonLat[] {
  const deg = metersToDegrees(centre[1]);
  const ring: LonLat[] = [];
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    ring.push([centre[0] + Math.cos(a) * radiusMeters * deg.lon, centre[1] + Math.sin(a) * radiusMeters * deg.lat]);
  }
  return ring;
}

function paint(map: MapLibreMap) {
  for (const { layer, property, token } of colourBindings()) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property as never, cssVar(token) as never);
  }
}

function addLayers(map: MapLibreMap) {
  for (const id of MAP_SOURCES) map.addSource(id, { type: "geojson", data: EMPTY });
  for (const layer of MAP_LAYERS) map.addLayer(resolveLayer(layer, cssVar) as unknown as LayerSpecification);
}

// Marker tuning. Dots closer than CLUSTER_PX merge into a numbered cluster; names are drawn for the
// selected pin and the one nearest you, and for others only from LABEL_ZOOM, where they fit.
const CLUSTER_PX = 44;
const LABEL_ZOOM = 11.5;
const PLACE_LABEL_ZOOM = 11;
const NEARBY_METERS = 3_000;

// Frame the whole reserve in the clear space between the chip at the top and the bottom row (the Day and
// Night button, the scale bar and the "Demo data" row; on phones the map also runs under the dock), so it
// is not left low on the screen.
function framePadding(map: MapLibreMap, top: HTMLElement | null) {
  const side = 32;
  const height = map.getContainer().clientHeight;
  return {
    top: Math.min((top?.offsetHeight ?? 0) + 28, height * 0.4),
    bottom: window.innerWidth >= 960 ? 56 : Math.min(164, height * 0.3),
    left: side,
    right: side,
  };
}

// The part of the map nothing floats over: below the chip, left of the map buttons, above the bottom row.
function clearArea(map: MapLibreMap, top: HTMLElement | null) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const bottom = window.innerWidth >= 960 ? 88 : 164;
  return { left: 0, top: (top?.offsetHeight ?? 0) + 16, right: width - 84, bottom: height - bottom };
}

// The Day and Night button floats over the map's bottom-left corner. Names keep clear of it.
function themeButtonObstacle(map: MapLibreMap) {
  const button = document.querySelector(".theme-fab");
  if (!button) return [];
  const frame = map.getContainer().getBoundingClientRect();
  const box = button.getBoundingClientRect();
  return [{ x: box.left + box.width / 2 - frame.left, y: box.top + box.height / 2 - frame.top, radius: box.width / 2 + 10 }];
}

type Props = { to: string | null };

export default function ParkMap({ to }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const placeMarkers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  // The dot whose preview card is open (a long press), shown selected and named.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [gpsOn, setGpsOn] = useState(false);
  const [showPredicted, setShowPredicted] = useState(false);
  const [showCells, setShowCells] = useState(true);
  const [satellite, setSatellite] = useState(false);
  const [realReady, setRealReady] = useState(false);
  const [panel, setPanel] = useState<"none" | "legend" | "info">("none");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const now = useNow(60_000);
  const geo = useGeolocation(gpsOn);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  const { data } = useStoreData(
    async (store) => {
      const at = new Date();
      const [pack, sightings, offered] = await Promise.all([store.activePack(), store.listSightings(at), store.localPacks()]);
      return { pack, sightings, offered };
    },
    [],
  );
  const pack = data?.pack ?? null;
  const real = pack?.kind === "pmtiles" ? pack : null;
  const reserve: Reserve | null = pack?.data ?? null;
  // A real pack the computer serving the app offers, when none is on this phone (development only).
  const offered = !real ? data?.offered?.[0] ?? null : null;

  const visibleSightings: Sighting[] = useMemo(
    () => (now && data ? data.sightings.filter((s) => (s.source === "sample" ? isPublic(s, now) : true)) : []),
    [data, now],
  );
  const target = to ? visibleSightings.find((s) => s.id === to) ?? null : null;
  const fix: LonLat | null = geo.fix ? [geo.fix.lon, geo.fix.lat] : null;
  const inside = reserve && fix ? isInsideReserve(reserve, fix) : false;
  const gate = reserve?.nodes.find((n) => n.kind === "gate") ?? null;
  const permission = target && now ? canGuide(target, now) : null;

  // Re-route when the fix moves by about 20 m, not on every reading.
  const roughLon = fix ? Math.round(fix[0] * 5000) / 5000 : null;
  const roughLat = fix ? Math.round(fix[1] * 5000) / 5000 : null;
  const allowed = Boolean(permission?.ok);
  const gateLon = gate?.at[0] ?? null;
  const gateLat = gate?.at[1] ?? null;
  const targetLon = target?.cell.centre[0] ?? null;
  const targetLat = target?.cell.centre[1] ?? null;
  const startLon = inside && roughLon !== null ? roughLon : gateLon;
  const startLat = inside && roughLat !== null ? roughLat : gateLat;
  const route: RouteResult | null =
    reserve && targetLon !== null && targetLat !== null && allowed && startLon !== null && startLat !== null
      ? cachedRoute(reserve, [startLon, startLat], [targetLon, targetLat], showPredicted)
      : null;
  const routeKey = route ? `${route.edgeIds.join(",")}:${Math.round(route.lengthMeters)}` : "";
  const routeRef = useRef<RouteResult | null>(null);
  useEffect(() => {
    routeRef.current = route;
  });

  // The sighting nearest you (inside the reserve, within a few km) is the one that gets a name by default.
  const fixLon = geo.fix?.lon ?? null;
  const fixLat = geo.fix?.lat ?? null;
  let nearbyId: string | null = null;
  if (fixLon !== null && fixLat !== null && inside) {
    let nearest = NEARBY_METERS;
    for (const s of visibleSightings) {
      const distance = distanceMeters([fixLon, fixLat], s.cell.centre);
      if (distance <= nearest) {
        nearest = distance;
        nearbyId = s.id;
      }
    }
  }

  const offRoute = route && fix && inside ? distanceToPolylineMeters(fix, route.line) : null;
  const offRouteLimit = Math.max(150, (geo.fix?.accuracy ?? 0) * 1.5);

  // Create the map once.
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    // Label fonts are the app's own files (public/map-fonts), so names draw with no network.
    const style = { version: 8, sources: {}, layers: [], "font-faces": mapFontFaces(window.location.origin) } as unknown as StyleSpecification;
    const map = new MapLibreMap({
      container: container.current,
      style,
      center: [22.4, -21.3],
      zoom: 9.6,
      attributionControl: false,
      maxPitch: 0,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => {
      addLayers(map);
      setReady(true);
    });
    // Sighting dots are regrouped when the camera comes to rest, and a tap on bare map clears the selection.
    map.on("moveend", () => setTick((t) => t + 1));
    // Camp names show once you are zoomed in far enough to have room for them.
    const nameCamps = () => map.getContainer().classList.toggle("map-zoomed", map.getZoom() >= PLACE_LABEL_ZOOM);
    map.on("zoom", nameCamps);
    nameCamps();
    map.on("click", (event) => {
      const hit = event.originalEvent.target as HTMLElement | null;
      if (!hit?.closest(".pin-wrap, .pin-cluster")) setSelectedId(null);
    });
    mapRef.current = map;
    // Debugging aid: /map?debug exposes the map instance in the console.
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { koriMap?: MapLibreMap }).koriMap = map;
    const observer = new MutationObserver(() => {
      paint(map);
      if (map.getLayer("imagery")) map.setPaintProperty("imagery", "raster-brightness-max", isNight() ? IMAGERY_NIGHT_BRIGHTNESS : 1);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pack layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const set = (id: string, value: unknown) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(value as GeoJSON.GeoJSON);
    if (!reserve) {
      for (const id of ["boundary", "pans", "river", "tracks"]) set(id, EMPTY);
      return;
    }
    const layers = reserveGeoJSON(reserve);
    const isReal = reserve.kind === "real";
    // A real pack's boundary is the park clipped to the pack's window: it is used to tell whether you
    // are inside, but the park's edge is drawn from the base map, so the window's straight sides are
    // not mistaken for the park's.
    set("boundary", isReal ? EMPTY : layers.boundary);
    set("pans", layers.pans);
    set("river", layers.river);
    set("tracks", layers.tracks);
    if (!to) {
      if (isReal) coverBounds(map, reserve.bounds, framePadding(map, topRef.current));
      else map.fitBounds(reserve.bounds, { padding: framePadding(map, topRef.current), duration: 0 });
    }

    placeMarkers.current.forEach((m) => m.remove());
    // In a real pack the gates and camps are named by the base map's labels instead.
    placeMarkers.current = isReal
      ? []
      : reserve.nodes
          .filter((n) => n.kind !== "junction")
          .map((node) => {
            const el = document.createElement("div");
            el.className = `place-marker place-${node.kind}`;
            const name = document.createElement("span");
            name.className = "place-name";
            name.textContent = node.name ?? "";
            el.append(name);
            return new Marker({ element: el, anchor: "center" }).setLngLat(node.at).addTo(map);
          });
  }, [reserve, ready, to]);

  // A real pack's base map and imagery, from this phone's storage.
  const realKey = real ? `${real.id}:${real.downloadedAt}` : "";
  const realRef = useRef(real);
  useEffect(() => {
    realRef.current = real;
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const current = realRef.current;
    let alive = true;
    if (!current) {
      removeRealPack(map);
      const t = window.setTimeout(() => setRealReady(false), 0);
      return () => window.clearTimeout(t);
    }
    addRealPack(map, current)
      .then((ok) => {
        if (!alive) return;
        if (!ok) setDownloadError("The pack's map files are missing on this phone. Download the pack again from Offline and packs.");
        setRealReady(ok);
      })
      .catch(() => alive && setDownloadError("The pack's map files could not be read from this phone's storage."));
    return () => {
      alive = false;
    };
  }, [realKey, ready]);

  // Predicted tracks, cells and the satellite layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("tracks-predicted", "visibility", showPredicted ? "visible" : "none");
    for (const id of CELL_LAYER_IDS) map.setLayoutProperty(id, "visibility", showCells ? "visible" : "none");
    applySatellite(map, satellite && realReady);
  }, [showPredicted, showCells, satellite, realReady, ready]);

  // Sighting areas: the 1 km (or 10 km) squares that are actually published.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const features = visibleSightings.map((s) => ({
      type: "Feature" as const,
      properties: { id: s.id, sensitive: sensitivityOf(s) === "sensitive" },
      geometry: { type: "Polygon" as const, coordinates: [cellRing(s.cell)] },
    }));
    (map.getSource("cells") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  }, [visibleSightings, ready]);

  // Sighting dots. Each marks the middle of its area (never an exact spot). Dots that would touch
  // merge into a numbered cluster, and a name is written only beside the selected pin, the one
  // nearest you, and, zoomed in, pins whose name fits without covering anything else.
  const pinMarkers = useRef<Marker[]>([]);
  const targetId = target?.id ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    pinMarkers.current.forEach((m) => m.remove());
    pinMarkers.current = [];
    if (!showCells) return;
    const byId = new Map(visibleSightings.map((s) => [s.id, s]));
    const all: Pin[] = visibleSightings.map((s) => {
      const at = map.project(s.cell.centre);
      return { id: s.id, x: at.x, y: at.y, sensitive: sensitivityOf(s) === "sensitive", name: speciesById(s.speciesId)?.common ?? "Sighting" };
    });
    // The selected pin, the guidance target and the nearest pin always stand alone.
    const standalone = new Set([selectedId, targetId, nearbyId].filter((id): id is string => Boolean(id)));
    const grouped = groupPins(
      all.filter((p) => !standalone.has(p.id)),
      CLUSTER_PX,
    );
    const pins = [...grouped.pins, ...all.filter((p) => standalone.has(p.id))];
    const labels = placeLabels(pins, {
      required: [...standalone],
      optional: map.getZoom() >= LABEL_ZOOM,
      area: clearArea(map, topRef.current),
      obstacles: [...grouped.clusters.map((c) => ({ x: c.x, y: c.y, radius: 24 })), ...themeButtonObstacle(map)],
    });

    // A camp's name steps aside when it would sit under a pin's name, a dot or a cluster.
    const taken = [
      ...pins.flatMap((pin) => [circleBox(pin.x, pin.y, 16), ...(labels.has(pin.id) ? [labelBox(pin, labels.get(pin.id)!)] : [])]),
      ...grouped.clusters.map((c) => circleBox(c.x, c.y, 24)),
    ];
    for (const marker of placeMarkers.current) {
      const at = map.project(marker.getLngLat());
      const text = marker.getElement().textContent ?? "";
      const name = { left: at.x + 14, right: at.x + 14 + text.length * 7.4 + 24, top: at.y - 15, bottom: at.y + 15 };
      marker.getElement().classList.toggle("name-hidden", taken.some((box) => overlaps(name, box, 2)));
    }

    for (const pin of pins) {
      const s = byId.get(pin.id);
      if (!s) continue;
      const selected = pin.id === selectedId || pin.id === targetId;
      const wrap = document.createElement("div");
      wrap.className = `pin-wrap${selected ? " is-selected" : ""}`;
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `pin${pin.sensitive ? " pin-sensitive" : ""}`;
      dot.setAttribute("aria-label", `${pin.name}${pin.sensitive ? ", sensitive species, presence only" : ""}. Opens the sighting; press and hold, or use the menu key, for a preview.`);
      watchPress(dot, "pin", (outcome) => {
        if (outcome === "open") routerRef.current.push(`/sighting?id=${encodeURIComponent(pin.id)}`);
        else if (outcome === "preview") setSelectedId(pin.id);
      });
      wrap.append(dot);
      const side = labels.get(pin.id);
      if (side) {
        const label = document.createElement("a");
        label.className = `pin-label pin-label-${side}`;
        label.href = `/sighting?id=${encodeURIComponent(pin.id)}`;
        label.textContent = pin.name;
        wrap.append(label);
      }
      pinMarkers.current.push(new Marker({ element: wrap, anchor: "center" }).setLngLat(s.cell.centre).addTo(map));
    }

    for (const cluster of grouped.clusters) {
      const bounds = new LngLatBounds();
      for (const member of cluster.members) {
        const s = byId.get(member.id);
        if (s) bounds.extend(s.cell.centre);
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pin-cluster";
      el.textContent = String(cluster.members.length);
      el.setAttribute("aria-label", `${cluster.members.length} sightings close together. Zoom in to see them.`);
      watchPress(el, "cluster", (outcome) => {
        if (outcome === "zoom") map.fitBounds(bounds, { padding: 96, maxZoom: 15, duration: 400 });
      });
      const centre = map.unproject([cluster.x, cluster.y]);
      pinMarkers.current.push(new Marker({ element: el, anchor: "center" }).setLngLat([centre.lng, centre.lat]).addTo(map));
    }
  }, [visibleSightings, ready, showCells, selectedId, targetId, nearbyId, tick]);

  // Route: redrawn only when the route itself changes, so the map does not jump on every GPS reading.
  useEffect(() => {
    const map = mapRef.current;
    const current = routeRef.current;
    if (!map || !ready) return;
    const data = current ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: current.line } } : EMPTY;
    (map.getSource("route") as GeoJSONSource | undefined)?.setData(data as GeoJSON.GeoJSON);
    if (current) {
      const lons = current.line.map((p) => p[0]);
      const lats = current.line.map((p) => p[1]);
      // Leave room for the banner above and the route sheet below, in proportion to the map's size.
      const { clientHeight: h, clientWidth: w } = map.getContainer();
      const padding = { top: Math.round(h * 0.16), bottom: Math.round(h * 0.42), left: Math.round(w * 0.08), right: Math.round(Math.min(90, w * 0.22)) };
      map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], { padding, duration: 400 });
    }
  }, [routeKey, ready]);

  // Your position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!geo.fix) {
      meMarker.current?.remove();
      meMarker.current = null;
      (map.getSource("accuracy") as GeoJSONSource | undefined)?.setData(EMPTY);
      return;
    }
    const at: LonLat = [geo.fix.lon, geo.fix.lat];
    if (!meMarker.current) {
      const el = document.createElement("div");
      el.className = "me-marker";
      el.setAttribute("aria-label", "Your position");
      meMarker.current = new Marker({ element: el }).setLngLat(at).addTo(map);
    } else meMarker.current.setLngLat(at);
    (map.getSource("accuracy") as GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [circle(at, Math.min(geo.fix.accuracy, 2_000))] },
    });
  }, [geo.fix, ready]);

  function locate() {
    if (!gpsOn) setGpsOn(true);
    else if (geo.fix && mapRef.current) mapRef.current.flyTo({ center: [geo.fix.lon, geo.fix.lat], zoom: Math.max(mapRef.current.getZoom(), 13), duration: 600 });
  }

  // Fly to the first fix after switching GPS on.
  const flewTo = useRef(false);
  useEffect(() => {
    if (!gpsOn) {
      flewTo.current = false;
      return;
    }
    if (geo.fix && !flewTo.current && mapRef.current && !to) {
      flewTo.current = true;
      mapRef.current.flyTo({ center: [geo.fix.lon, geo.fix.lat], zoom: Math.max(mapRef.current.getZoom(), 12), duration: 600 });
    }
  }, [gpsOn, geo.fix, to]);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await getStore().downloadPack(SAMPLE_RESERVE_ID, "/packs/sample-reserve");
    } catch (reason) {
      setDownloadError(reason instanceof Error ? reason.message : "The pack could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadReal(id: string) {
    setDownloading(true);
    setDownloadError(null);
    try {
      await getStore().downloadRealPack(id, setProgress);
    } catch (reason) {
      setDownloadError(reason instanceof Error ? reason.message : "The pack could not be downloaded.");
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }

  const distanceFromReserve = reserve && fix && !inside ? distanceMeters(fix, reserve.centre) : null;
  const shortName = (name: string) => name.split(",")[0].trim();
  const percent = progress ? Math.floor((progress.overall / Math.max(1, progress.overallTotal)) * 100) : null;
  const preview = selectedId ? visibleSightings.find((s) => s.id === selectedId) ?? null : null;
  const routeCaution = route && reserve ? reserve.edges.some((e) => e.caution && route.edgeIds.includes(e.id)) : false;

  return (
    <div className="map-page">
      {/* MapLibre sets position: relative on its container, so the absolute frame wraps it. */}
      <div className="map-canvas">
        <div ref={container} style={{ width: "100%", height: "100%" }} role="region" aria-label="Park map" />
      </div>

      <div className="map-top" ref={topRef}>
        {data && !reserve && !offered ? (
          <div className="map-chip">
            <span className="map-chip-text">No park pack</span>
            <button type="button" className="map-chip-btn" onClick={download} disabled={downloading}>
              {downloading ? "Downloading…" : "Download the sample pack"}
            </button>
          </div>
        ) : null}
        {data && offered ? (
          <div className="map-chip">
            <span className="map-chip-text">{reserve ? "Real map on this computer" : "No park pack"}</span>
            <button type="button" className="map-chip-btn" onClick={() => downloadReal(offered.id)} disabled={downloading}>
              {downloading ? `Downloading… ${percent ?? 0}%` : `Download the ${shortName(offered.name)} pack`}
            </button>
          </div>
        ) : null}
        {downloadError ? (
          <div className="map-banner" role="alert">
            <Icon name="alert" size={20} />
            <span>{downloadError}</span>
          </div>
        ) : null}
        {gpsOn && geo.message ? (
          <div className="map-banner">
            <Icon name="alert" size={20} />
            <span>{geo.message}</span>
          </div>
        ) : null}
        {gpsOn && geo.status === "waiting" ? (
          <div className="map-banner">
            <Icon name="locate" size={20} />
            <span>Finding you. GPS works without mobile signal; the first fix can take a minute.</span>
          </div>
        ) : null}
      </div>

      <div className="map-foot">
        <DemoDataChip />
        {real ? (
          // The map's credits, always on screen while a real pack is drawn.
          <span className="map-foot-text map-credits">
            {OSM_CREDIT}
            {satellite && realReady ? <span className="map-credit-imagery"> · {SENTINEL_CREDIT}</span> : null}
          </span>
        ) : data?.pack ? (
          <span className="map-foot-text">Pack {formatBytes(data.pack.bytes)}</span>
        ) : null}
        <button type="button" className="map-foot-i" onClick={() => setPanel(panel === "info" ? "none" : "info")} aria-label="About this map" aria-expanded={panel === "info"}>
          <Icon name="info" size={20} />
        </button>
      </div>

      <div className="map-controls">
        <button type="button" className="icon-btn" onClick={locate} aria-label={gpsOn ? "Centre on my position" : "Show my position"} aria-pressed={gpsOn}>
          <Icon name="locate" size={26} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setPanel(panel === "legend" ? "none" : "legend")} aria-label="Layers and key" aria-expanded={panel === "legend"}>
          <Icon name="layers" size={26} />
        </button>
        {reserve ? (
          <button type="button" className="icon-btn" onClick={() => mapRef.current && mapRef.current.fitBounds(reserve.bounds, { padding: framePadding(mapRef.current, topRef.current), duration: 400 })} aria-label="Show the whole reserve">
            <Icon name="map" size={26} />
          </button>
        ) : null}
      </div>

      {panel === "legend" ? (
        <div className="map-sheet" role="dialog" aria-label="Layers and key">
          <div className="section-head">
            <h2>Key</h2>
            <button type="button" className="btn btn-quiet" onClick={() => setPanel("none")}>
              Close
            </button>
          </div>
          {real ? (
            <label className="check">
              <input type="checkbox" checked={satellite} disabled={!realReady} onChange={(e) => setSatellite(e.target.checked)} />
              <span>
                Satellite imagery
                <br />
                <span className="hint">Sentinel-2, 2 August 2025, 10 m pixels. Context only: most tracks are narrower than a pixel, so the tracks you see are drawn from OpenStreetMap on top.</span>
              </span>
            </label>
          ) : null}
          <ul className="legend">
            {real ? (
              <>
                <li>
                  <span className="swatch-line osm" /> Track from OpenStreetMap: {TRACK_STATUS_LABEL.osm}. It may be missing, misplaced or closed.
                </li>
                <li>
                  <span className="swatch-line park" /> Park boundary
                </li>
              </>
            ) : (
              <>
                <li>
                  <span className="swatch-line" /> Verified track (reviewed)
                </li>
                <li>
                  <span className="swatch-line gps" /> GPS-confirmed track (3 or more trips; synthetic in the sample)
                </li>
                <li>
                  <span className="swatch-line predicted" /> Predicted, not verified (sample)
                </li>
              </>
            )}
            <li>
              <span className="swatch-cell" /> Sighting area (1 km)
            </li>
            <li>
              <span className="swatch-dot" /> A sighting, marked at the middle of its area, not at the animal
            </li>
            <li>
              <span className="swatch-cluster">3</span> Several sightings close together; tap to zoom in
            </li>
            <li>
              <span className="swatch-cell sensitive" /> Sensitive species, presence only (10 km)
            </li>
            <li>
              <span className="swatch-dot sensitive" /> A sensitive species, marked as a ring
            </li>
            {real ? null : (
              <li>
                <span className="swatch-place" /> The gate and camps (camp names show when you zoom in)
              </li>
            )}
            <li>
              <span className="swatch-me" /> You
            </li>
          </ul>
          <label className="check">
            <input type="checkbox" checked={showCells} onChange={(e) => setShowCells(e.target.checked)} />
            <span>Show sighting areas</span>
          </label>
          {real ? null : (
            <label className="check">
              <input type="checkbox" checked={showPredicted} onChange={(e) => setShowPredicted(e.target.checked)} />
              <span>
                Show predicted tracks
                <br />
                <span className="hint">Predicted from imagery, not verified by anyone. Only high-confidence ones are used for routing, and only while this is on. No substitute for a guide.</span>
              </span>
            </label>
          )}
        </div>
      ) : null}

      {panel === "info" ? (
        <div className="map-sheet" role="dialog" aria-label="About this map">
          <div className="section-head">
            <h2>About this map</h2>
            <button type="button" className="btn btn-quiet" onClick={() => setPanel("none")}>
              Close
            </button>
          </div>
          {real ? (
            <>
              <p>
                <strong>{real.name}: a real map, private pack.</strong> Tracks are from OpenStreetMap and not verified by Kori: they may be missing, misplaced or
                closed. Follow park rules and signs, and drive only on tracks. The sightings are sample data placed on real ground.
              </p>
              <p className="muted">
                Pack {formatBytes(real.bytes)}, on this phone, drawn with no network. Version {real.version}. Kept on the owner&apos;s devices only: a real park is published only after the
                Department of Wildlife and National Parks agrees.
              </p>
              <p className="faint">
                Map data {OSM_CREDIT}, under the Open Database License (ODbL); the pack&apos;s base map and tracks are ODbL too. {SENTINEL_CREDIT}. Drawn with MapLibre GL JS.{" "}
                <Link href="/about#credits">Credits and licences</Link>.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>Sample reserve, fictional.</strong> Its tracks and places are generated and do not match the ground. Do not navigate by it.
              </p>
              <p className="muted">
                Maps draw only from packs you have downloaded, so they work with no signal.{" "}
                {data?.pack ? `Pack ${formatBytes(data.pack.bytes)}, on this phone.` : "No pack is on this phone yet."}
              </p>
              <p className="faint">
                <Link href="/about#demo-data">About the demo data</Link>. Drawn with MapLibre GL JS.
              </p>
            </>
          )}
        </div>
      ) : null}

      {preview && panel === "none" && !to ? (
        <div className="map-sheet map-preview" role="dialog" aria-label={`${speciesById(preview.speciesId)?.common ?? "Sighting"}, preview`}>
          <div className="section-head">
            <h2>{speciesById(preview.speciesId)?.common ?? "Sighting"}</h2>
            <button type="button" className="btn btn-quiet" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <p className="muted">
            {preview.count} seen {now ? relativeTime(preview.seenAt, now) : ""} · {sensitivityOf(preview) === "sensitive" ? "10 km area, presence only" : "1 km area"}
            {preview.source === "sample" ? " · sample" : ""}
          </p>
          <Link href={`/sighting?id=${encodeURIComponent(preview.id)}`} className="btn" style={{ alignSelf: "flex-start" }}>
            Open
          </Link>
        </div>
      ) : null}

      {to && panel === "none" ? (
        <div className="map-sheet" aria-live="polite">
          <div className="section-head">
            <h2>{target ? `To the ${speciesById(target.speciesId)?.common.toLowerCase()} area` : "Route"}</h2>
            <Link href="/map" className="btn btn-quiet">
              End
            </Link>
          </div>
          {!target ? (
            <p className="muted">That sighting is not visible on this phone.</p>
          ) : !permission?.ok ? (
            <p className="notice notice-plain">{permission?.reason}</p>
          ) : !reserve ? (
            <p className="muted">Download the park pack to route along its tracks.</p>
          ) : !route ? (
            <p className="notice notice-warn">No route along known tracks reaches this area. Kori will not suggest leaving the tracks.</p>
          ) : (
            <>
              <p>
                <strong style={{ fontSize: "var(--fs-lg)" }}>{formatDistance(route.lengthMeters)}</strong> along tracks, from {inside ? "your position" : gate?.name ?? "the gate"}.
              </p>
              {!inside ? (
                <p className="faint">
                  {fix && distanceFromReserve !== null
                    ? `You are ${formatDistance(distanceFromReserve)} from ${real ? shortName(reserve.name) : "the sample reserve"}, so the route starts at the gate.`
                    : "Your position is off or outside the reserve, so the route starts at the gate."}
                </p>
              ) : null}
              {real ? (
                <p className="notice notice-plain">
                  <Icon name="info" size={20} />
                  <span>
                    Tracks: <strong>{TRACK_STATUS_LABEL.osm}</strong>. Follow park signs and your guide.
                  </span>
                </p>
              ) : null}
              {routeCaution ? (
                <p className="notice notice-warn">
                  <Icon name="alert" size={20} />
                  <span>Part of this route is on a track OpenStreetMap marks as one to avoid. Kori uses it only because no reasonable alternative reaches the area.</span>
                </p>
              ) : null}
              {offRoute !== null && offRoute > offRouteLimit ? (
                <p className="notice notice-warn">
                  <Icon name="alert" size={20} />
                  <span>You are {formatDistance(offRoute)} from the route. Go back along the track you came on. Do not cut across country.</span>
                </p>
              ) : null}
              {route.predictedMeters > 0 ? (
                <p className="notice notice-warn">
                  <Icon name="alert" size={20} />
                  <span>
                    {formatDistance(route.predictedMeters)} of this route is on a <strong>predicted, unverified</strong> track (high confidence). It may not exist or may be impassable.
                  </span>
                </p>
              ) : null}
              <p className="faint">Ends at the nearest track point in the sighting&apos;s area, not at the animal. Stay on tracks; off-road and night driving are not allowed in Botswana&apos;s parks.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
