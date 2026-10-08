/**
 * The reviewer's view of where a sighting was recorded: the exact point (reviewers only), its
 * accuracy, and the cell that would be published. Drawn on the fictional sample reserve.
 */

import type { LonLat } from "@/shared/geo";
import { metersToDegrees } from "@/shared/geo";
import { cellRing, type Cell } from "@/shared/rules";
import { sampleReserve, visibleEdges } from "@/shared/reserve";

export function ReviewMap({ point, accuracy, cell, sensitive }: { point: LonLat; accuracy?: number; cell: Cell; sensitive: boolean }) {
  const reserve = sampleReserve();
  const span = sensitive ? 26_000 : 5_000;
  const deg = metersToDegrees(point[1]);
  const W = 480;
  const H = 300;
  const halfLon = (span * deg.lon) / 2;
  const halfLat = ((span * H) / W) * deg.lat * 0.5;
  const [cx, cy] = cell.centre;
  const p = ([lon, lat]: LonLat) => [((lon - (cx - halfLon)) / (2 * halfLon)) * W, ((cy + halfLat - lat) / (2 * halfLat)) * H];
  const path = (line: LonLat[], close = false) => line.map((pt, i) => `${i ? "L" : "M"}${p(pt).map((v) => v.toFixed(1)).join(" ")}`).join("") + (close ? "Z" : "");
  const [px, py] = p(point);
  const accPx = accuracy ? Math.max(3, (accuracy / span) * W) : 0;
  return (
    <svg className="thumb" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Recorded point and the area that would be published">
      <rect width={W} height={H} fill="var(--m-land-2)" />
      <path d={path(reserve.boundary, true)} fill="var(--m-land)" stroke="var(--m-boundary)" strokeWidth="2" strokeDasharray="8 5" />
      {reserve.pans.map((pan) => (
        <path key={pan.name} d={path(pan.ring, true)} fill="var(--m-pan)" stroke="var(--m-water)" strokeWidth="1.5" />
      ))}
      <path d={path(reserve.river)} fill="none" stroke="var(--m-river)" strokeWidth="4" strokeLinecap="round" />
      {visibleEdges(reserve, { predicted: false }).map((edge) => (
        <path key={edge.id} d={path(edge.line)} fill="none" stroke="var(--m-track)" strokeWidth="2.5" strokeLinecap="round" />
      ))}
      <path
        d={path(cellRing(cell), true)}
        fill={sensitive ? "var(--m-cell-sensitive)" : "var(--m-cell)"}
        fillOpacity="0.16"
        stroke={sensitive ? "var(--m-cell-sensitive)" : "var(--m-cell)"}
        strokeWidth="3"
        strokeDasharray={sensitive ? "9 6" : undefined}
      />
      {accPx ? <circle cx={px} cy={py} r={accPx} fill="var(--m-me)" fillOpacity="0.18" /> : null}
      <circle cx={px} cy={py} r="7" fill="var(--c-ink)" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}
