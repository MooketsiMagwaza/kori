// Places the app's sample sightings on real ground for a park pack. Every one is SAMPLE data: the
// species, counts, times and observers are the app's own seeds (shared/sample-sightings.ts), only
// the positions are new.
//
// Each position is the middle of a 1 km area (shared/rules.ts cellFor), near an OSM track, inside
// the park and the imagery, and checked:
//   - not on water: outside every water polygon and at least 150 m from rivers, streams, canals;
//   - near a track: the area's middle is within 800 m of a routable OSM track, so guidance can
//     end in it;
//   - away from rhino: every OSM feature with "rhino" in its name is treated as a possible rhino
//     area (a name is not evidence, but nothing is assumed). The sighting's published area (1 km,
//     or 10 km for sensitive species, by the existing rules) must stay at least 5 km clear of it:
//     the distance to the area's middle is at least half the area's diagonal plus 5 km. Further
//     exclusion areas can be passed with --exclude (a GeoJSON of points or polygons, never
//     committed). No known rhino area is in the Savuti window to the builder's knowledge; that is
//     an assumption for the owner to confirm with DWNP.
//
//   node place-sightings.ts --graph graph.json --water water.geojson --rhino rhino.geojson
//        --core W,S,E,N --out sightings.json [--exclude extra.geojson] [--seed 20261026]

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { distanceMeters, distanceToPolylineMeters, pointInRing, type LonLat } from "../../shared/geo.ts";
import type { Reserve, TrackEdge } from "../../shared/reserve.ts";
import { cellFor, ruleFor } from "../../shared/rules.ts";
import { SAMPLE_SEEDS } from "../../shared/sample-sightings.ts";
import { speciesById } from "../../shared/species.ts";

type Geometry = { type: string; coordinates: unknown };
type FeatureCollection = { features: { properties: Record<string, unknown>; geometry: Geometry }[] };

const { values } = parseArgs({
  options: {
    graph: { type: "string" },
    water: { type: "string" },
    rhino: { type: "string" },
    exclude: { type: "string" },
    core: { type: "string" },
    out: { type: "string" },
    seed: { type: "string", default: "20261026" },
  },
});
for (const key of ["graph", "water", "rhino", "core", "out"] as const) {
  if (!values[key]) throw new Error(`--${key} is required`);
}

const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const reserve = read<Reserve>(values.graph!);
const water = read<FeatureCollection>(values.water!);
const rhino = read<FeatureCollection>(values.rhino!);
const extra = values.exclude ? read<FeatureCollection>(values.exclude) : { features: [] };
const [west, south, east, north] = values.core!.split(",").map(Number);

const MIN_FROM_WATERWAY = 150;
const MAX_FROM_TRACK = 800;
const RHINO_CLEARANCE = 5_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Water: polygons (outer rings with holes) and lines.
const polygons: LonLat[][][] = [];
const lines: LonLat[][] = [];
for (const { geometry } of water.features) {
  if (geometry.type === "Polygon") polygons.push(geometry.coordinates as LonLat[][]);
  else if (geometry.type === "MultiPolygon") polygons.push(...(geometry.coordinates as LonLat[][][]));
  else if (geometry.type === "LineString") lines.push(geometry.coordinates as LonLat[]);
  else if (geometry.type === "MultiLineString") lines.push(...(geometry.coordinates as LonLat[][]));
}
const onWater = (p: LonLat) => polygons.some(([outer, ...holes]) => pointInRing(p, outer) && !holes.some((hole) => pointInRing(p, hole)));
const nearWaterway = (p: LonLat) => lines.some((line) => distanceToPolylineMeters(p, line) < MIN_FROM_WATERWAY);

// Places to keep clear of: points, or polygons (measured from every vertex, which is close enough
// at kilometre clearances).
const keepClear: { name: string; points: LonLat[] }[] = [...rhino.features, ...extra.features].map((f) => {
  const g = f.geometry;
  const points =
    g.type === "Point"
      ? [g.coordinates as LonLat]
      : g.type === "Polygon"
        ? (g.coordinates as LonLat[][])[0]
        : g.type === "MultiPolygon"
          ? (g.coordinates as LonLat[][][]).flatMap((poly) => poly[0])
          : [];
  return { name: String(f.properties.name ?? "unnamed"), points };
});

const tracks: TrackEdge[] = reserve.edges.filter((e) => e.status !== "closed" && e.status !== "predicted" && !e.caution);
const nearestTrack = (p: LonLat) => Math.min(...tracks.map((e) => distanceToPolylineMeters(p, e.line)));
// Pick tracks in proportion to their length, so the many short tracks around camps do not draw
// every sighting to one place.
const cumulative: number[] = [];
tracks.reduce((sum, e) => {
  cumulative.push(sum + e.lengthMeters);
  return sum + e.lengthMeters;
}, 0);
const totalLength = cumulative[cumulative.length - 1];
const pickTrack = (r: number) => {
  const target = r * totalLength;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return tracks[lo];
};

const rand = mulberry32(Number(values.seed));
const used = new Set<string>();
const positions: LonLat[] = [];
const checks: Record<string, unknown>[] = [];

SAMPLE_SEEDS.forEach((seed, index) => {
  const published = ruleFor(seed).cellMeters;
  const clearance = (published * Math.SQRT2) / 2 + RHINO_CLEARANCE;
  for (let attempt = 0; attempt < 5_000; attempt += 1) {
    const edge = pickTrack(rand());
    const vertex = edge.line[Math.floor(rand() * edge.line.length)];
    const offset = 80 + rand() * 520;
    const angle = rand() * Math.PI * 2;
    const latScale = 1 / 110_574;
    const lonScale = 1 / (111_320 * Math.cos((vertex[1] * Math.PI) / 180));
    const point: LonLat = [vertex[0] + Math.cos(angle) * offset * lonScale, vertex[1] + Math.sin(angle) * offset * latScale];
    const cell = cellFor(point, 1_000);
    const centre = cell.centre;
    if (used.has(cell.id)) continue;
    if (centre[0] < west || centre[0] > east || centre[1] < south || centre[1] > north) continue;
    if (!pointInRing(centre, reserve.boundary)) continue;
    if (onWater(centre) || nearWaterway(centre)) continue;
    const toTrack = nearestTrack(centre);
    if (toTrack > MAX_FROM_TRACK) continue;
    const publishedCentre = cellFor(centre, published).centre;
    const closest = keepClear
      .flatMap((place) => place.points.map((p) => ({ name: place.name, metres: distanceMeters(p, publishedCentre) })))
      .sort((a, b) => a.metres - b.metres)[0];
    if (closest && closest.metres < clearance) continue;
    used.add(cell.id);
    positions.push(centre);
    checks.push({
      index,
      species: speciesById(seed.speciesId)?.common ?? seed.speciesId,
      sensitive: published > 1_000,
      position: centre,
      area1km: cell.id,
      publishedArea: cellFor(centre, published).id,
      metresToTrack: Math.round(toTrack),
      insidePark: true,
      onWater: false,
      nearestKeepClear: closest ? { name: closest.name, km: Math.round(closest.metres / 100) / 10, neededKm: Math.round(clearance / 100) / 10 } : null,
      attempts: attempt + 1,
    });
    return;
  }
  throw new Error(`no place found for sample sighting ${index} (${seed.speciesId}) after 5000 tries`);
});

const output = {
  label: "SAMPLE sightings on a real map: positions only; species, counts, times and observers are the app's sample seeds",
  generator: "tools/map-pack/place-sightings.ts",
  seed: Number(values.seed),
  count: positions.length,
  cellMeters: 1_000,
  positions,
  rules: {
    position: "middle of a 1 km area (shared/rules.ts cellFor)",
    water: `outside every OSM water polygon and at least ${MIN_FROM_WATERWAY} m from rivers, streams and canals`,
    track: `within ${MAX_FROM_TRACK} m of a routable OSM track`,
    rhino: `published area at least ${RHINO_CLEARANCE / 1000} km clear of every OSM feature named after rhino and every --exclude feature`,
  },
  keepClear: keepClear.map((k) => k.name),
  assumptions: [
    "No known rhino area lies in the window; to be confirmed with DWNP. Features named after rhino are kept clear anyway.",
    "Water is OSM water: seasonal pans and channels may be dry or wet whatever OSM says.",
    "The park boundary is OSM's, clipped to the window.",
  ],
  checks,
};
writeFileSync(values.out!, JSON.stringify(output, null, 1));
console.log(`placed ${positions.length} sample sightings; nearest keep-clear distances (km):`, checks.map((c) => (c.nearestKeepClear as { km: number } | null)?.km).join(", "));
