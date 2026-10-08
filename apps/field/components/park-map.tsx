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
import { AttributionControl, Map as MapLibreMap, Marker, ScaleControl, type GeoJSONSource } from "maplibre-gl";
import type { LonLat } from "@/shared/geo";
import { distanceMeters, distanceToPolylineMeters, formatDistance, metersToDegrees } from "@/shared/geo";
import { reserveGeoJSON, isInsideReserve, SAMPLE_RESERVE_ID, type Reserve } from "@/shared/reserve";
import { routeAlongTracks, type RouteResult } from "@/shared/routing";
import { canGuide, cellRing, isPublic, sensitivityOf } from "@/shared/rules";
import type { Sighting } from "@/shared/sample-sightings";
import { speciesById } from "@/shared/species";
import { Icon } from "@/shared/icons";
import { getStore } from "@/lib/store";
import { formatBytes, useGeolocation, useNow, useStoreData } from "@/lib/hooks";

const EMPTY = { type: "FeatureCollection" as const, features: [] };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
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
  const set = (layer: string, prop: string, value: string) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop as never, value as never);
  };
  set("bg", "background-color", cssVar("--m-land-2"));
  set("boundary-fill", "fill-color", cssVar("--m-land"));
  set("boundary-line", "line-color", cssVar("--m-boundary"));
  set("pans-fill", "fill-color", cssVar("--m-pan"));
  set("pans-line", "line-color", cssVar("--m-water"));
  set("river", "line-color", cssVar("--m-river"));
  set("tracks-verified", "line-color", cssVar("--m-track"));
  set("tracks-gps", "line-color", cssVar("--m-track-gps"));
  set("tracks-predicted", "line-color", cssVar("--m-track-predicted"));
  set("cells-fill", "fill-color", cssVar("--m-cell"));
  set("cells-line", "line-color", cssVar("--m-cell"));
  set("cells-sensitive-line", "line-color", cssVar("--m-cell-sensitive"));
  set("route-casing", "line-color", cssVar("--c-surface"));
  set("route", "line-color", cssVar("--m-route"));
  set("accuracy", "fill-color", cssVar("--m-me"));
}

function addLayers(map: MapLibreMap) {
  const sources = ["boundary", "pans", "river", "tracks", "cells", "route", "accuracy"];
  for (const id of sources) map.addSource(id, { type: "geojson", data: EMPTY });
  map.addLayer({ id: "bg", type: "background", paint: { "background-color": "#e6d8b9" } });
  map.addLayer({ id: "boundary-fill", type: "fill", source: "boundary", paint: { "fill-color": "#efe5cf" } });
  map.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": "#6e5a3e", "line-width": 2, "line-dasharray": [4, 3] } });
  map.addLayer({ id: "pans-fill", type: "fill", source: "pans", paint: { "fill-color": "#d9dccf" } });
  map.addLayer({ id: "pans-line", type: "line", source: "pans", paint: { "line-color": "#9cc0c9", "line-width": 1.5 } });
  map.addLayer({ id: "river", type: "line", source: "river", layout: { "line-cap": "round" }, paint: { "line-color": "#b9a37c", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 7] } });
  map.addLayer({
    id: "tracks-predicted",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "predicted"],
    layout: { visibility: "none", "line-cap": "butt" },
    paint: { "line-color": "#8a7b66", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 14, 3.5], "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: "tracks-gps",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "gps"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#6b4a2a", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 14, 4] },
  });
  map.addLayer({
    id: "tracks-verified",
    type: "line",
    source: "tracks",
    filter: ["==", ["get", "status"], "verified"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#3a2716", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 5] },
  });
  map.addLayer({ id: "cells-fill", type: "fill", source: "cells", paint: { "fill-color": "#8c3a0c", "fill-opacity": 0.16 } });
  map.addLayer({ id: "cells-line", type: "line", source: "cells", filter: ["!", ["get", "sensitive"]], paint: { "line-color": "#8c3a0c", "line-width": 2.5 } });
  map.addLayer({
    id: "cells-sensitive-line",
    type: "line",
    source: "cells",
    filter: ["get", "sensitive"],
    paint: { "line-color": "#a2251a", "line-width": 2.5, "line-dasharray": [3, 2] },
  });
  map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 10 } });
  map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1f6f8b", "line-width": 6 } });
  map.addLayer({ id: "accuracy", type: "fill", source: "accuracy", paint: { "fill-color": "#1f6f8b", "fill-opacity": 0.15 } });
  paint(map);
}

type Props = { to: string | null };

export default function ParkMap({ to }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const htmlMarkers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
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
    map.addControl(new AttributionControl({ compact: true, customAttribution: "Sample reserve: fictional, generated by Kori" }));
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => {
      addLayers(map);
      setReady(true);
    });
    // Below zoom 11 the sighting labels shrink to dots so they do not pile on top of each other.
    const compact = () => map.getContainer().classList.toggle("labels-compact", map.getZoom() < 11);
    map.on("zoom", compact);
    compact();
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
    if (!to) map.fitBounds(reserve.bounds, { padding: 40, duration: 0 });

    htmlMarkers.current.forEach((m) => m.remove());
    htmlMarkers.current = reserve.nodes
      .filter((n) => n.kind !== "junction")
      .map((node) => {
        const el = document.createElement("div");
        el.className = "place-marker";
        el.textContent = node.name ?? "";
        return new Marker({ element: el, anchor: "bottom" }).setLngLat(node.at).addTo(map);
      });
  }, [reserve, ready, to]);

  // Predicted tracks and cells visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("tracks-predicted", "visibility", showPredicted ? "visible" : "none");
    for (const id of ["cells-fill", "cells-line", "cells-sensitive-line"]) map.setLayoutProperty(id, "visibility", showCells ? "visible" : "none");
  }, [showPredicted, showCells, ready]);

  // Sighting cells, with a label marker each.
  const cellMarkers = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const features = visibleSightings.map((s) => ({
      type: "Feature" as const,
      properties: { id: s.id, sensitive: sensitivityOf(s) === "sensitive" },
      geometry: { type: "Polygon" as const, coordinates: [cellRing(s.cell)] },
    }));
    (map.getSource("cells") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    cellMarkers.current.forEach((m) => m.remove());
    cellMarkers.current = showCells
      ? visibleSightings.map((s) => {
          const el = document.createElement("a");
          el.href = `/sighting?id=${encodeURIComponent(s.id)}`;
          el.className = `cell-label${sensitivityOf(s) === "sensitive" ? " sensitive" : ""}`;
          el.textContent = speciesById(s.speciesId)?.common ?? "Sighting";
          return new Marker({ element: el }).setLngLat(s.cell.centre).addTo(map);
        })
      : [];
  }, [visibleSightings, ready, showCells]);

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

      <div className="map-top">
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
          <button type="button" className="icon-btn" onClick={() => mapRef.current?.fitBounds(reserve.bounds, { padding: 40, duration: 400 })} aria-label="Show the whole reserve">
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
              <span className="swatch-cell sensitive" /> Sensitive species, presence only (10 km)
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
