// Tests for what a real park pack adds to routing and the sample data, on a small synthetic graph.
// No real pack is used: packs are private and never committed.
//   node --test "tests/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";

import type { LonLat } from "../shared/geo.ts";
import type { Reserve, TrackEdge } from "../shared/reserve.ts";
import { TRACK_STATUS_LABEL } from "../shared/reserve.ts";
import { routableEdges, routeAlongTracks } from "../shared/routing.ts";
import { cellFor, ruleFor } from "../shared/rules.ts";
import { SAMPLE_SEEDS, sampleSightings } from "../shared/sample-sightings.ts";
import { lineLengthMeters } from "../shared/geo.ts";

// A 2 km square of OSM tracks (a -> b -> c -> d -> a) with a diagonal a -> c that OSM says to avoid.
const at: Record<string, LonLat> = { a: [24.0, -18.5], b: [24.02, -18.5], c: [24.02, -18.48], d: [24.0, -18.48] };
const edge = (id: string, from: string, to: string, extra: Partial<TrackEdge> = {}): TrackEdge => {
  const line: LonLat[] = [at[from], at[to]];
  return { id, from, to, line, status: "osm", source: "osm", lengthMeters: Math.round(lineLengthMeters(line)), ...extra };
};
const reserve: Reserve = {
  id: "test",
  name: "Test",
  version: "1",
  notice: "",
  kind: "real",
  centre: [24.01, -18.49],
  bounds: [23.99, -18.51, 24.03, -18.47],
  boundary: [
    [23.99, -18.51],
    [24.03, -18.51],
    [24.03, -18.47],
    [23.99, -18.47],
    [23.99, -18.51],
  ],
  pans: [],
  river: [],
  nodes: Object.entries(at).map(([id, p]) => ({ id, at: p, kind: "junction" as const })),
  edges: [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("cd", "c", "d"), edge("da", "d", "a"), edge("ac", "a", "c", { caution: 'OSM name: "Avoid this road"' })],
};

test("OSM tracks are routable and labelled as not verified", () => {
  assert.equal(routableEdges(reserve, { includePredicted: false }).length, 5);
  assert.equal(TRACK_STATUS_LABEL.osm, "OSM, not verified");
  const route = routeAlongTracks(reserve, at.a, at.b, { includePredicted: false });
  assert.ok(route);
  assert.deepEqual(route.edgeIds, ["ab"]);
});

test("a track OSM says to avoid is used only when the way round is more than four times longer", () => {
  // a to c: the diagonal is about 3.0 km, the way round about 4.2 km; at four times the cost the
  // diagonal loses.
  const route = routeAlongTracks(reserve, at.a, at.c, { includePredicted: false });
  assert.ok(route);
  assert.ok(!route.edgeIds.includes("ac"), `route used the caution edge: ${route.edgeIds.join(",")}`);
  // With the way round closed, the caution edge is still better than no route.
  const closed: Reserve = { ...reserve, edges: reserve.edges.map((e) => (e.id === "bc" || e.id === "cd" ? { ...e, status: "closed" as const } : e)) };
  const forced = routeAlongTracks(closed, at.a, at.c, { includePredicted: false });
  assert.ok(forced);
  assert.ok(forced.edgeIds.includes("ac"));
});

test("routing stays on the graph: the route starts and ends on a track vertex", () => {
  const route = routeAlongTracks(reserve, [24.005, -18.501], [24.021, -18.482], { includePredicted: false });
  assert.ok(route);
  const vertices = reserve.edges.flatMap((e) => e.line.map((p) => p.join(",")));
  assert.ok(vertices.includes(route.line[0].join(",")));
  assert.ok(vertices.includes(route.line[route.line.length - 1].join(",")));
});

test("a pack's positions replace the generated ones, and keep the publication rules", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const positions: LonLat[] = SAMPLE_SEEDS.map((_, i) => cellFor([24.0 + i * 0.01, -18.5], 1_000).centre);
  const placed = sampleSightings(now, positions);
  assert.equal(placed.length, SAMPLE_SEEDS.length);
  placed.forEach((s, i) => {
    assert.deepEqual(s.point, positions[i]);
    assert.equal(s.source, "sample");
    assert.equal(s.cell.sizeMeters, ruleFor(SAMPLE_SEEDS[i]).cellMeters, "sensitive species keep their 10 km area");
  });
  // Same species, counts and times as the sample reserve's sightings; only positions differ.
  const generated = sampleSightings(now);
  assert.deepEqual(
    placed.map((s) => [s.speciesId, s.count, s.seenAt, s.status, s.accuracyMeters]),
    generated.map((s) => [s.speciesId, s.count, s.seenAt, s.status, s.accuracyMeters]),
  );
  // A wrong-length list is ignored rather than half-applied.
  assert.deepEqual(sampleSightings(now, positions.slice(1)).map((s) => s.point), generated.map((s) => s.point));
});
