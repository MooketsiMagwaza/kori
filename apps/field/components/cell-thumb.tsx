"use client";

/**
 * A small drawing of the active pack around a sighting's cell: the sample reserve, or a real park
 * pack's OpenStreetMap tracks. It shows the area, never a point: the square is the published cell
 * (1 km, or 10 km for sensitive species).
 */

import type { LonLat } from "@/shared/geo";
import { metersToDegrees } from "@/shared/geo";
import { cellRing, type Cell } from "@/shared/rules";
import { sampleReserve, visibleEdges } from "@/shared/reserve";
import { useActivePack } from "@/lib/hooks";

type Props = { cell: Cell; sensitive?: boolean; title?: string; showTracks?: boolean };

export function CellThumb({ cell, sensitive = false, title, showTracks = true }: Props) {
  const active = useActivePack();
  const reserve = active?.data ?? sampleReserve();
  const span = cell.sizeMeters * (sensitive ? 2.4 : 5);
  const deg = metersToDegrees(cell.centre[1]);
  const halfLon = (span * deg.lon) / 2;
  const halfLat = (span * deg.lat * 0.75) / 2;
  const [cx, cy] = cell.centre;
  const W = 400;
  const H = 300;
  const project = ([lon, lat]: LonLat) => [((lon - (cx - halfLon)) / (2 * halfLon)) * W, ((cy + halfLat - lat) / (2 * halfLat)) * H];
  const path = (line: LonLat[], close = false) =>
    line.map((p, i) => `${i ? "L" : "M"}${project(p).map((v) => v.toFixed(1)).join(" ")}`).join("") + (close ? "Z" : "");
  const ring = cellRing(cell);
  // Only the tracks near the drawing (a real pack has hundreds).
  const near = (line: LonLat[]) => line.some(([lon, lat]) => Math.abs(lon - cx) < halfLon * 1.5 && Math.abs(lat - cy) < halfLat * 1.5);
  const tracks = showTracks ? visibleEdges(reserve, { predicted: false }).filter((edge) => near(edge.line)) : [];

  return (
    <svg className="thumb" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={title ?? "Map of the area where this sighting was recorded"}>
      <rect width={W} height={H} fill="var(--m-land-2)" />
      {reserve.boundary.length ? (
        <path d={path(reserve.boundary, true)} fill="var(--m-land)" stroke={reserve.kind === "real" ? "none" : "var(--m-boundary)"} strokeWidth="2" strokeDasharray="8 5" />
      ) : null}
      {reserve.pans.map((pan) => (
        <path key={pan.name} d={path(pan.ring, true)} fill="var(--m-pan)" stroke="var(--m-water)" strokeWidth="1.5" />
      ))}
      {reserve.river.length ? <path d={path(reserve.river)} fill="none" stroke="var(--m-river)" strokeWidth="4" strokeLinecap="round" /> : null}
      {tracks.map((edge) => (
        <path key={edge.id} d={path(edge.line)} fill="none" stroke={edge.status === "gps" ? "var(--m-track-gps)" : "var(--m-track)"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <path
        d={path(ring, true)}
        fill={sensitive ? "var(--m-cell-sensitive)" : "var(--m-cell)"}
        fillOpacity="0.2"
        stroke={sensitive ? "var(--m-cell-sensitive)" : "var(--m-cell)"}
        strokeWidth="4"
        strokeDasharray={sensitive ? "10 6" : undefined}
      />
    </svg>
  );
}
