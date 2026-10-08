/**
 * Small, dependency-free geometry helpers. Coordinates are [longitude, latitude] pairs, as in
 * GeoJSON, unless a parameter says otherwise.
 *
 * `distanceMeters` and `distanceToPolylineMeters` started from the owner's earlier live-trip
 * helpers (see PROVENANCE.md); the rest is new.
 */

export type LonLat = [number, number];

const EARTH_RADIUS_METERS = 6_371_000;
const toRad = (value: number) => (value * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Length of a polyline in metres. */
export function lineLengthMeters(line: readonly LonLat[]): number {
  let total = 0;
  for (let index = 1; index < line.length; index += 1) total += distanceMeters(line[index - 1], line[index]);
  return total;
}

/**
 * Shortest distance in metres from a point to a polyline. Segments are projected onto a local flat
 * plane, accurate to well under a metre over the distances that matter for an off-route check.
 * Returns Infinity when the line has fewer than two points.
 */
export function distanceToPolylineMeters(point: LonLat, line: readonly LonLat[]): number {
  if (line.length < 2) return Number.POSITIVE_INFINITY;
  const cosLat = Math.cos(toRad(point[1]));
  const metersPerDegree = (Math.PI / 180) * EARTH_RADIUS_METERS;
  const toXY = ([lon, lat]: LonLat) => ({ x: (lon - point[0]) * metersPerDegree * cosLat, y: (lat - point[1]) * metersPerDegree });
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    const a = toXY(line[index - 1]);
    const b = toXY(line[index]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

/** Ray-casting point-in-polygon test for one ring. */
export function pointInRing(point: LonLat, ring: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Metres to degrees at a latitude, for building small local shapes. */
export function metersToDegrees(latitude: number): { lon: number; lat: number } {
  return { lon: 1 / (111_320 * Math.cos(toRad(latitude))), lat: 1 / 110_574 };
}

/** Human-readable distance: "850 m", "4.2 km", "38 km". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "unknown";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}
