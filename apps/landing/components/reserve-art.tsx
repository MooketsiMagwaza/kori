/**
 * Drawings of the fictional sample reserve, rendered on the server as SVG. They use the same seeded
 * generator, rules and routing as the field app, so what the landing page shows is what the app
 * computes, not a mock-up.
 */

import type { LonLat } from "@/shared/geo";
import { metersToDegrees } from "@/shared/geo";
import { sampleReserve, visibleEdges, type Reserve } from "@/shared/reserve";
import { routeAlongTracks } from "@/shared/routing";
import { cellFor, cellRing, RULES } from "@/shared/rules";
import { publicSightings, sampleSightings } from "@/shared/sample-sightings";

// A fixed "now" so the server render is stable between builds.
const NOW = new Date("2026-10-07T15:00:00Z");

type View = { west: number; south: number; east: number; north: number; width: number; height: number };

function projector(view: View) {
  return ([lon, lat]: LonLat) => [((lon - view.west) / (view.east - view.west)) * view.width, ((view.north - lat) / (view.north - view.south)) * view.height] as const;
}

function pathOf(view: View, line: LonLat[], close = false) {
  const p = projector(view);
  return line.map((pt, i) => `${i ? "L" : "M"}${p(pt).map((v) => v.toFixed(1)).join(" ")}`).join("") + (close ? "Z" : "");
}

function viewAround(centre: LonLat, spanMeters: number, width: number, height: number): View {
  const deg = metersToDegrees(centre[1]);
  const halfLon = (spanMeters * deg.lon) / 2;
  const halfLat = ((spanMeters * height) / width) * deg.lat * 0.5;
  return { west: centre[0] - halfLon, east: centre[0] + halfLon, south: centre[1] - halfLat, north: centre[1] + halfLat, width, height };
}

function Base({ reserve, view, predicted = false }: { reserve: Reserve; view: View; predicted?: boolean }) {
  return (
    <>
      <rect width={view.width} height={view.height} fill="var(--m-land-2)" />
      <path d={pathOf(view, reserve.boundary, true)} fill="var(--m-land)" stroke="var(--m-boundary)" strokeWidth="2" strokeDasharray="7 5" />
      {reserve.pans.map((pan) => (
        <path key={pan.name} d={pathOf(view, pan.ring, true)} fill="var(--m-pan)" stroke="var(--m-water)" strokeWidth="1.5" />
      ))}
      <path d={pathOf(view, reserve.river)} fill="none" stroke="var(--m-river)" strokeWidth="4" strokeLinecap="round" />
      {visibleEdges(reserve, { predicted }).map((edge) => (
        <path
          key={edge.id}
          d={pathOf(view, edge.line)}
          fill="none"
          stroke={edge.status === "predicted" ? "var(--m-track-predicted)" : edge.status === "gps" ? "var(--m-track-gps)" : "var(--m-track)"}
          strokeWidth={edge.status === "predicted" ? 2 : 2.6}
          strokeDasharray={edge.status === "predicted" ? "5 4" : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}

/** The whole reserve, with approved sighting areas and one route from the gate. */
export function HeroMap() {
  const reserve = sampleReserve();
  const width = 360;
  const height = 520;
  const [w, s, e, n] = reserve.bounds;
  const padLon = (e - w) * 0.04;
  const view: View = { west: w - padLon, east: e + padLon, south: s - (n - s) * 0.08, north: n + (n - s) * 0.32, width, height };
  const sightings = publicSightings(sampleSightings(NOW), NOW).filter((x) => !x.sensitive);
  const target = sightings.find((x) => x.speciesId === "leopard") ?? sightings[0];
  const gate = reserve.nodes.find((x) => x.kind === "gate")!;
  const route = routeAlongTracks(reserve, gate.at, target.cell.centre, { includePredicted: false });
  const p = projector(view);
  const [gx, gy] = p(gate.at);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="art" role="img" aria-label="The fictional sample reserve with approved sighting areas and a route along tracks from the gate">
      <Base reserve={reserve} view={view} />
      {sightings.map((x) => (
        <path key={x.id} d={pathOf(view, cellRing(x.cell), true)} fill="var(--m-cell)" fillOpacity="0.22" stroke="var(--m-cell)" strokeWidth="2" />
      ))}
      {route ? (
        <>
          <path d={pathOf(view, route.line)} fill="none" stroke="var(--c-surface)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathOf(view, route.line)} fill="none" stroke="var(--m-route)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      <circle cx={gx} cy={gy} r="9" fill="var(--m-me)" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}

/** A standard sighting's 1 km area beside a sensitive species' 10 km area, at the same scale. */
export function CellCompare() {
  const reserve = sampleReserve();
  const centre = reserve.nodes[Math.floor(reserve.nodes.length / 2)].at;
  const width = 560;
  const height = 300;
  const view = viewAround(centre, 26_000, width, height);
  const small = cellFor([centre[0] - 0.06, centre[1] + 0.01], RULES.standard.cellMeters);
  const large = cellFor([centre[0] + 0.05, centre[1] - 0.01], RULES.sensitive.cellMeters);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="art" role="img" aria-label="A 1 km sighting area beside a 10 km area for a sensitive species, drawn at the same scale">
      <Base reserve={reserve} view={view} />
      <path d={pathOf(view, cellRing(large), true)} fill="var(--m-cell-sensitive)" fillOpacity="0.14" stroke="var(--m-cell-sensitive)" strokeWidth="3" strokeDasharray="9 6" />
      <path d={pathOf(view, cellRing(small), true)} fill="var(--m-cell)" fillOpacity="0.3" stroke="var(--m-cell)" strokeWidth="3" />
    </svg>
  );
}

/** Route along tracks to an area, with the straight line Kori never draws struck through. */
export function GuidanceArt() {
  const reserve = sampleReserve();
  const gate = reserve.nodes.find((x) => x.kind === "gate")!;
  const sightings = publicSightings(sampleSightings(NOW), NOW).filter((x) => !x.sensitive);
  const target = sightings.find((x) => x.speciesId === "giraffe") ?? sightings[0];
  const route = routeAlongTracks(reserve, gate.at, target.cell.centre, { includePredicted: false });
  const lons = [gate.at[0], target.cell.centre[0], ...(route?.line.map((x) => x[0]) ?? [])];
  const lats = [gate.at[1], target.cell.centre[1], ...(route?.line.map((x) => x[1]) ?? [])];
  const width = 560;
  const height = 360;
  const padLon = (Math.max(...lons) - Math.min(...lons)) * 0.18 + 0.01;
  const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.12 + 0.01;
  const view: View = { west: Math.min(...lons) - padLon, east: Math.max(...lons) + padLon, south: Math.min(...lats) - padLat, north: Math.max(...lats) + padLat, width, height };
  const p = projector(view);
  const [ax, ay] = p(gate.at);
  const [bx, by] = p(target.cell.centre);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="art" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A route that follows tracks to a sighting area, and a crossed-out straight line across country that Kori never offers">
      <Base reserve={reserve} view={view} predicted />
      <path d={pathOf(view, cellRing(target.cell), true)} fill="var(--m-cell)" fillOpacity="0.25" stroke="var(--m-cell)" strokeWidth="3" />
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--c-bad)" strokeWidth="3" strokeDasharray="3 7" strokeLinecap="round" />
      <g transform={`translate(${mx} ${my})`} stroke="var(--c-bad)" strokeWidth="5" strokeLinecap="round">
        <line x1="-11" y1="-11" x2="11" y2="11" />
        <line x1="11" y1="-11" x2="-11" y2="11" />
      </g>
      {route ? (
        <>
          <path d={pathOf(view, route.line)} fill="none" stroke="var(--c-surface)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathOf(view, route.line)} fill="none" stroke="var(--m-route)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      <circle cx={ax} cy={ay} r="9" fill="var(--m-me)" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}

/** A synthetic trip: the first and last kilometre faded, the middle kept. */
export function TripArt() {
  const width = 560;
  const height = 220;
  const points: [number, number][] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    points.push([30 + t * 500, 150 - Math.sin(t * Math.PI * 1.4) * 70 + Math.sin(t * 19) * 6]);
  }
  const line = (from: number, to: number) => points.slice(from, to + 1).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="art" role="img" aria-label="A synthetic trip trace with its first and last kilometre removed before sharing">
      <rect width={width} height={height} fill="var(--m-land)" />
      <path d={line(0, 9)} fill="none" stroke="var(--m-track-predicted)" strokeWidth="4" strokeDasharray="4 6" strokeLinecap="round" />
      <path d={line(51, 60)} fill="none" stroke="var(--m-track-predicted)" strokeWidth="4" strokeDasharray="4 6" strokeLinecap="round" />
      <path d={line(9, 51)} fill="none" stroke="var(--m-route)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[0][0]} cy={points[0][1]} r="6" fill="var(--c-surface)" stroke="var(--m-track-predicted)" strokeWidth="3" />
      <circle cx={points[60][0]} cy={points[60][1]} r="6" fill="var(--c-surface)" stroke="var(--m-track-predicted)" strokeWidth="3" />
    </svg>
  );
}
