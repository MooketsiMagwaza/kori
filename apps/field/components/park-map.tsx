"use client";

/**
 * The park map. Draws only what is stored on this phone: the downloaded pack (GeoJSON in IndexedDB)
 * and the sightings list. No tiles are fetched, so it works with no signal. Your position comes from
 * the phone's GPS, which needs no mobile signal either.
 *
 * Guidance (?to=<sighting id>) routes along tracks only, from your position if you are inside the
 * reserve, otherwise from the gate. Predicted tracks are hidden and left out of routing until you
 * switch them on, and they are always drawn dashed.
 */

import "@/lib/maplibre-setup";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AttributionControl, LngLatBounds, Map as MapLibreMap, Marker, ScaleControl, type GeoJSONSource, type LayerSpecification } from "maplibre-gl";
import type { LonLat } from "@/shared/geo";
import { distanceMeters, distanceToPolylineMeters, formatDistance, metersToDegrees } from "@/shared/geo";
import { CELL_LAYER_IDS, MAP_LAYERS, MAP_SOURCES, colourBindings, resolveLayer } from "@/shared/map-style";
import { circleBox, groupPins, labelBox, overlaps, placeLabels, type Pin } from "@/shared/map-markers";
import { reserveGeoJSON, isInsideReserve, SAMPLE_RESERVE_ID, type Reserve } from "@/shared/reserve";
import { routeAlongTracks, type RouteResult } from "@/shared/routing";
import { canGuide, cellRing, isPublic, sensitivityOf } from "@/shared/rules";
import type { Sighting } from "@/shared/sample-sightings";
import { speciesById } from "@/shared/species";
import { Icon } from "@/shared/icons";
import { getStore } from "@/lib/store";
import { formatBytes, useGeolocation, useNow, useStoreData } from "@/lib/hooks";

const EMPTY = { type: "FeatureCollection" as const, features: [] };

// Colours come from the design tokens (--m-*), read when the layers are added and again when the
// theme changes. There is no colour in this file.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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

// Frame the whole reserve in the clear space between the notices at the top and the dock at the
// bottom (the map runs under the dock on phones), so it is not left low on the screen.
function framePadding(map: MapLibreMap, top: HTMLElement | null) {
  const side = 32;
  const height = map.getContainer().clientHeight;
  return {
    top: Math.min((top?.offsetHeight ?? 0) + 28, height * 0.4),
    bottom: window.innerWidth >= 960 ? side : Math.min(132, height * 0.25),
    left: side,
    right: side,
  };
}

// The part of the map no panel covers: below the notices, left of the map buttons, above the dock.
function clearArea(map: MapLibreMap, top: HTMLElement | null) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const bottom = window.innerWidth >= 960 ? 16 : 112;
  return { left: 0, top: (top?.offsetHeight ?? 0) + 16, right: width - 84, bottom: height - bottom };
}

type Props = { to: string | null };

export default function ParkMap({ to }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const placeMarkers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [gpsOn, setGpsOn] = useState(false);
  const [showPredicted, setShowPredicted] = useState(false);
  const [showCells, setShowCells] = useState(true);
  const [panel, setPanel] = useState<"none" | "legend">("none");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const now = useNow(60_000);
  const geo = useGeolocation(gpsOn);

  const { data } = useStoreData(
    async (store) => {
      const at = new Date();
      const [pack, sightings] = await Promise.all([store.getPack(SAMPLE_RESERVE_ID), store.listSightings(at)]);
      return { pack: pack ?? null, sightings };
    },
    [],
  );
  const reserve: Reserve | null = data?.pack?.data ?? null;

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
  // Routing over about 45 junctions takes well under a millisecond, so it simply runs each render.
  const start: LonLat | null =
    inside && roughLon !== null && roughLat !== null ? [roughLon, roughLat] : gateLon !== null && gateLat !== null ? [gateLon, gateLat] : null;
  const route: RouteResult | null =
    reserve && targetLon !== null && targetLat !== null && allowed && start
      ? routeAlongTracks(reserve, start, [targetLon, targetLat], { includePredicted: showPredicted, minConfidence: "high" })
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
    const map = new MapLibreMap({
      container: container.current,
      style: { version: 8, sources: {}, layers: [] },
      center: [22.4, -21.3],
      zoom: 9.6,
      attributionControl: false,
      maxPitch: 0,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new AttributionControl({ compact: true, customAttribution: "Sample reserve: fictional, generated by Kori" }), "bottom-left");
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
    const observer = new MutationObserver(() => paint(map));
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
    set("boundary", layers.boundary);
    set("pans", layers.pans);
    set("river", layers.river);
    set("tracks", layers.tracks);
    if (!to) map.fitBounds(reserve.bounds, { padding: framePadding(map, topRef.current), duration: 0 });

    placeMarkers.current.forEach((m) => m.remove());
    placeMarkers.current = reserve.nodes
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

  // Predicted tracks and cells visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("tracks-predicted", "visibility", showPredicted ? "visible" : "none");
    for (const id of CELL_LAYER_IDS) map.setLayoutProperty(id, "visibility", showCells ? "visible" : "none");
  }, [showPredicted, showCells, ready]);

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
      obstacles: grouped.clusters.map((c) => ({ x: c.x, y: c.y, radius: 24 })),
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
      dot.setAttribute("aria-label", `${pin.name}${pin.sensitive ? ", sensitive species, presence only" : ""}. Show its name.`);
      dot.setAttribute("aria-pressed", String(selected));
      dot.addEventListener("click", () => setSelectedId((current) => (current === pin.id ? null : pin.id)));
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
      el.addEventListener("click", () => map.fitBounds(bounds, { padding: 96, maxZoom: 15, duration: 400 }));
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

  const distanceFromReserve = reserve && fix && !inside ? distanceMeters(fix, reserve.centre) : null;

  return (
    <div className="map-page">
      {/* MapLibre sets position: relative on its container, so the absolute frame wraps it. */}
      <div className="map-canvas">
        <div ref={container} style={{ width: "100%", height: "100%" }} role="region" aria-label="Park map" />
      </div>

      <div className="map-top" ref={topRef}>
        {data && !reserve ? (
          <div className="map-banner">
            <Icon name="download" size={20} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span>
                <strong>No park pack on this phone.</strong> Maps draw only from packs you have downloaded, so they work with no signal.
              </span>
              <button type="button" className="btn" onClick={download} disabled={downloading} style={{ alignSelf: "flex-start" }}>
                {downloading ? "Downloading…" : "Download the sample pack"}
              </button>
              {downloadError ? <span className="faint">{downloadError}</span> : null}
            </div>
          </div>
        ) : null}
        {reserve ? (
          <div className="map-banner">
            <Icon name="info" size={20} />
            <span>
              <strong>Sample reserve, fictional.</strong> Generated tracks that do not match the ground. Do not navigate by it.
              {data?.pack ? <span className="faint"> Pack {formatBytes(data.pack.bytes)}, on this phone.</span> : null}
            </span>
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
          <ul className="legend">
            <li>
              <span className="swatch-line" /> Verified track (reviewed)
            </li>
            <li>
              <span className="swatch-line gps" /> GPS-confirmed track (3 or more trips; synthetic in the sample)
            </li>
            <li>
              <span className="swatch-line predicted" /> Predicted, not verified (sample)
            </li>
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
            <li>
              <span className="swatch-place" /> The gate and camps (camp names show when you zoom in)
            </li>
            <li>
              <span className="swatch-me" /> You
            </li>
          </ul>
          <label className="check">
            <input type="checkbox" checked={showCells} onChange={(e) => setShowCells(e.target.checked)} />
            <span>Show sighting areas</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={showPredicted} onChange={(e) => setShowPredicted(e.target.checked)} />
            <span>
              Show predicted tracks
              <br />
              <span className="hint">Predicted from imagery, not verified by anyone. Only high-confidence ones are used for routing, and only while this is on. No substitute for a guide.</span>
            </span>
          </label>
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
                    ? `You are ${formatDistance(distanceFromReserve)} from the sample reserve, so the route starts at the gate.`
                    : "Your position is off or outside the reserve, so the route starts at the gate."}
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
