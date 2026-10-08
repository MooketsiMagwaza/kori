// Tests for the shared safety rules, routing and share codes. Runs with Node's built-in test runner
// and type stripping, no build step:  node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { distanceToPolylineMeters, type LonLat } from "../shared/geo.ts";
import { isInsideReserve, reserveGeoJSON, sampleReserve } from "../shared/reserve.ts";
import { routableEdges, routeAlongTracks } from "../shared/routing.ts";
import { canGuide, canShare, cellFor, isPublic, RULES, sensitivityOf } from "../shared/rules.ts";
import { publicSightings, sampleSightings } from "../shared/sample-sightings.ts";
import { decodeShare, encodeShare, shareLink } from "../shared/share-code.ts";

const NOW = new Date("2026-10-07T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("the sample reserve is connected on non-predicted tracks", () => {
  const a = sampleReserve();
  assert.ok(a.nodes.length > 20, "has junctions");
  assert.ok(a.edges.some((e) => e.status === "predicted"), "has predicted tracks");
  assert.ok(a.edges.some((e) => e.status === "closed"), "has a closed track to exercise the rule");
  for (const node of a.nodes) assert.ok(isInsideReserve(a, node.at), `${node.id} is inside`);
  const gate = a.nodes.find((n) => n.kind === "gate")!.at;
  for (const node of a.nodes) {
    assert.ok(routeAlongTracks(a, gate, node.at, { includePredicted: false }), `${node.id} is reachable from the gate`);
  }
});

test("closed tracks never reach a map layer or a route", () => {
  const reserve = sampleReserve();
  const closed = reserve.edges.filter((e) => e.status === "closed").map((e) => e.id);
  const drawn = reserveGeoJSON(reserve).tracks.features.map((f) => f.properties.id);
  for (const id of closed) assert.ok(!drawn.includes(id), `${id} is not drawn`);
  const usable = routableEdges(reserve, { includePredicted: true, minConfidence: "medium" }).map((e) => e.id);
  for (const id of closed) assert.ok(!usable.includes(id), `${id} is not routable`);
});

test("predicted tracks are off by default and low confidence is never routable", () => {
  const reserve = sampleReserve();
  assert.ok(routableEdges(reserve, { includePredicted: false }).every((e) => e.status !== "predicted"));
  const withPredicted = routableEdges(reserve, { includePredicted: true, minConfidence: "medium" });
  assert.ok(withPredicted.every((e) => e.status !== "predicted" || e.confidence !== "low"));
});

test("a route stays on tracks from the gate to a sighting cell", () => {
  const reserve = sampleReserve();
  const gate = reserve.nodes.find((n) => n.kind === "gate")!.at;
  const target = sampleSightings(NOW).find((s) => s.speciesId === "giraffe")!.cell.centre;
  const route = routeAlongTracks(reserve, gate, target, { includePredicted: false });
  assert.ok(route, "a route exists");
  assert.equal(route.predictedMeters, 0, "no predicted track used by default");
  const tracks = routableEdges(reserve, { includePredicted: false }).map((e) => e.line);
  for (const point of route.line) {
    const nearest = Math.min(...tracks.map((line) => distanceToPolylineMeters(point, line)));
    assert.ok(nearest < 1, `route point ${point} lies on a track (${nearest.toFixed(2)} m)`);
  }
  assert.ok(route.lengthMeters > 0);
});

test("sensitive species and dens are coarse, late and never guided or shared", () => {
  assert.equal(sensitivityOf({ speciesId: "white-rhino" }), "sensitive");
  assert.equal(sensitivityOf({ speciesId: "wild-dog", denOrNest: true }), "sensitive");
  assert.equal(sensitivityOf({ speciesId: "not-a-species" }), "sensitive", "unknown species fail safe");
  const rhino = { speciesId: "black-rhino", seenAt: hoursAgo(24 * 30), status: "approved" as const };
  assert.equal(canGuide(rhino, NOW).ok, false);
  assert.equal(canShare(rhino, NOW).ok, false);
  assert.equal(RULES.sensitive.cellMeters, 10_000);
  const fresh = { speciesId: "white-rhino", seenAt: hoursAgo(24), status: "approved" as const };
  assert.equal(isPublic(fresh, NOW), false, "not public before 7 days");
});

test("no live locations: standard sightings wait an hour before anyone else sees them", () => {
  const recent = { speciesId: "lion", seenAt: hoursAgo(0.5), status: "approved" as const };
  assert.equal(isPublic(recent, NOW), false);
  assert.equal(canGuide(recent, NOW).ok, false);
  assert.equal(canShare(recent, NOW).ok, false);
  const older = { ...recent, seenAt: hoursAgo(2) };
  assert.equal(isPublic(older, NOW), true);
  assert.equal(canGuide(older, NOW).ok, true);
});

test("public sightings carry the cell, never the exact point or the observer", () => {
  const visible = publicSightings(sampleSightings(NOW), NOW);
  assert.ok(visible.length > 5);
  for (const s of visible) {
    assert.ok(!("point" in s) && !("observer" in s), "no point or observer");
    assert.equal(s.status, "approved");
  }
  const cell = cellFor([22.41234, -21.30123], 1_000);
  assert.deepEqual(cellFor([22.41234, -21.30123], 1_000), cell, "same point, same cell");
});

test("share codes round-trip and refuse sensitive or out-of-range content", () => {
  const cell = cellFor([22.41, -21.31], 1_000);
  const shared = { speciesId: "giraffe", count: 6, seenAt: hoursAgo(2), cell, reviewed: true };
  const link = shareLink("https://kori.example", shared);
  const back = decodeShare(link);
  assert.ok(back.ok);
  assert.equal(back.sighting.speciesId, "giraffe");
  assert.equal(back.sighting.count, 6);
  assert.deepEqual(back.sighting.cell.centre, [Number(cell.centre[0].toFixed(4)), Number(cell.centre[1].toFixed(4))]);

  const rhino = encodeShare({ ...shared, speciesId: "white-rhino" });
  assert.equal(decodeShare(rhino).ok, false);
  const outside = encodeShare({ ...shared, cell: { ...cell, centre: [2, 50] as LonLat } });
  assert.equal(decodeShare(outside).ok, false);
  assert.equal(decodeShare("https://example.com/not-kori").ok, false);
  assert.equal(decodeShare("k1.%%%").ok, false);
});
