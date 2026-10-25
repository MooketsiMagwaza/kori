// Tests for the park map's style and its marker grouping. Node's built-in runner, no build step:
//   node --test tests/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { groupPins, placeLabels, type Pin } from "../shared/map-markers.ts";
import { CELL_LAYER_IDS, MAP_LAYERS, colourBindings, resolveLayer } from "../shared/map-style.ts";

const pin = (id: string, x: number, y: number, name = "Giraffe"): Pin => ({ id, x, y, sensitive: false, name });

test("pins that would touch merge into one numbered cluster, and far ones stay pins", () => {
  const grouped = groupPins([pin("a", 100, 100), pin("b", 118, 104), pin("c", 109, 120), pin("far", 300, 300)], 44);
  assert.equal(grouped.clusters.length, 1);
  assert.equal(grouped.clusters[0].members.length, 3);
  assert.deepEqual(grouped.pins.map((p) => p.id), ["far"]);
});

test("grouping does not depend on the order the pins arrive in", () => {
  const pins = [pin("a", 40, 40), pin("b", 60, 50), pin("c", 200, 200), pin("d", 210, 215), pin("e", 400, 80)];
  const forward = groupPins(pins, 44);
  const backward = groupPins([...pins].reverse(), 44);
  const shape = (g: ReturnType<typeof groupPins>) => ({ pins: g.pins.map((p) => p.id).sort(), clusters: g.clusters.map((c) => c.members.map((m) => m.id).sort().join(",")).sort() });
  assert.deepEqual(shape(forward), shape(backward));
});

test("a single pin is never wrapped in a cluster of one", () => {
  const grouped = groupPins([pin("only", 10, 10)], 44);
  assert.equal(grouped.clusters.length, 0);
  assert.equal(grouped.pins.length, 1);
});

test("zoomed out, only the required pins are named", () => {
  const pins = [pin("a", 50, 50), pin("b", 200, 200), pin("c", 120, 300)];
  const labels = placeLabels(pins, { required: ["b"], optional: false, viewportWidth: 390 });
  assert.deepEqual([...labels.keys()], ["b"]);
});

test("the selected pin is named even when its label would cover another pin", () => {
  const pins = [pin("a", 100, 100, "Elephant"), pin("b", 150, 100, "Zebra")];
  const labels = placeLabels(pins, { required: ["a"], optional: true, viewportWidth: 390 });
  assert.ok(labels.has("a"));
  assert.ok(!labels.has("b"), "b's label would run into a's label and pin");
});

test("zoomed in, labels that fit are named and ones that would overlap are skipped", () => {
  const pins = [pin("a", 60, 100, "Lion"), pin("b", 70, 112, "Leopard"), pin("c", 60, 400, "Kudu")];
  const labels = placeLabels(pins, { required: [], optional: true, viewportWidth: 390 });
  assert.ok(labels.has("c"));
  assert.equal([...labels.keys()].filter((id) => id === "a" || id === "b").length, 1, "only one of two overlapping labels is drawn");
});

test("a label near the right edge flips to the left of its pin", () => {
  const labels = placeLabels([pin("edge", 360, 200, "Spotted hyena")], { required: ["edge"], optional: false, viewportWidth: 390 });
  assert.equal(labels.get("edge"), "left");
});

test("every colour the map style names is a token, in both themes, and no colour is hard-coded", () => {
  const css = readFileSync(new URL("../shared/tokens.css", import.meta.url), "utf8");
  const night = css.slice(css.indexOf('[data-theme="dark"] {'));
  for (const { layer, token } of colourBindings()) {
    assert.ok(css.includes(`${token}:`), `${layer} uses ${token}, which tokens.css does not define`);
    assert.ok(night.includes(`${token}:`), `${token} (used by ${layer}) has no Night value`);
  }
  for (const layer of MAP_LAYERS) assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(JSON.stringify(layer.paint)), `${layer.id} hard-codes a colour in its paint`);
});

test("resolving a layer reads each colour from its token", () => {
  const read = (token: string) => `resolved(${token})`;
  const spec = resolveLayer(MAP_LAYERS.find((l) => l.id === "route")!, read) as { paint: Record<string, unknown> };
  assert.equal(spec.paint["line-color"], "resolved(--m-route)");
  assert.equal(spec.paint["line-width"], 6);
});

test("the sighting area layers can be switched together, and sensitive areas have their own", () => {
  assert.deepEqual(CELL_LAYER_IDS.sort(), ["cells-fill", "cells-line", "cells-sensitive-fill", "cells-sensitive-line"]);
});
