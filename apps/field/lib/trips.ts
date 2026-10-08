/**
 * Privacy treatment of a trip before it could ever be shared: the first and last kilometre are
 * removed (they show where someone sleeps or works), and times are rounded down to the minute.
 * Sharing itself needs the Kori service and is not built yet (KO-10); the phone shows what would
 * be removed so the person can see it before choosing.
 */

import { distanceMeters, type LonLat } from "@/shared/geo";
import type { TripPoint } from "@/lib/store";

export const TRIM_METERS = 1_000;

export function tripLength(points: TripPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceMeters([points[i - 1].lon, points[i - 1].lat], [points[i].lon, points[i].lat]);
  return total;
}

/** Split a trace into the trimmed start, the part that could be shared, and the trimmed end. */
export function trimTrip(points: TripPoint[]): { head: TripPoint[]; kept: TripPoint[]; tail: TripPoint[] } {
  const total = tripLength(points);
  if (total <= TRIM_METERS * 2) return { head: points, kept: [], tail: [] };
  const head: TripPoint[] = [];
  const kept: TripPoint[] = [];
  const tail: TripPoint[] = [];
  let travelled = 0;
  points.forEach((p, i) => {
    if (i > 0) travelled += distanceMeters([points[i - 1].lon, points[i - 1].lat], [p.lon, p.lat]);
    const rounded = { ...p, t: Math.floor(p.t / 60_000) * 60_000 };
    if (travelled < TRIM_METERS) head.push(rounded);
    else if (travelled > total - TRIM_METERS) tail.push(rounded);
    else kept.push(rounded);
  });
  return { head, kept, tail };
}

export function toLine(points: TripPoint[]): LonLat[] {
  return points.map((p) => [p.lon, p.lat]);
}
