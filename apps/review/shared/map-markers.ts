/**
 * Keeps sighting markers from piling up on the park map.
 *
 * The map shows a small dot at the centre of each published area, never a text pill. Dots that
 * would touch merge into one numbered cluster (tap it to zoom in), and a species name is written
 * only beside the pin that is selected, the one nearest you, or, once you are zoomed in far enough,
 * a pin whose label fits without covering another label or marker.
 *
 * Both functions work in screen pixels and are pure, so they can be tested without a map.
 */

export type Pin = { id: string; x: number; y: number; sensitive: boolean; name: string };

export type Cluster = { id: string; x: number; y: number; members: Pin[] };

export type Grouped = { pins: Pin[]; clusters: Cluster[] };

/**
 * Greedy grouping: pins within `radius` pixels of a cluster's centre join it, otherwise they start
 * a new one. Pins are visited left to right, so the same screen always groups the same way.
 * A group of one stays a plain pin.
 */
export function groupPins(pins: Pin[], radius: number): Grouped {
  const sorted = [...pins].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
  const groups: { x: number; y: number; members: Pin[] }[] = [];
  for (const pin of sorted) {
    let best: (typeof groups)[number] | null = null;
    let bestDistance = radius;
    for (const group of groups) {
      const distance = Math.hypot(group.x - pin.x, group.y - pin.y);
      if (distance <= bestDistance) {
        best = group;
        bestDistance = distance;
      }
    }
    if (best) {
      best.members.push(pin);
      best.x = best.members.reduce((sum, m) => sum + m.x, 0) / best.members.length;
      best.y = best.members.reduce((sum, m) => sum + m.y, 0) / best.members.length;
    } else groups.push({ x: pin.x, y: pin.y, members: [pin] });
  }
  const singles: Pin[] = [];
  const clusters: Cluster[] = [];
  for (const group of groups) {
    if (group.members.length === 1) singles.push(group.members[0]);
    else clusters.push({ id: `${group.members[0].id}+${group.members.length - 1}`, x: group.x, y: group.y, members: group.members });
  }
  return { pins: singles, clusters };
}

export type LabelOptions = {
  /** Pins that always get a label (the selected one, the nearest to you), even if it overlaps. */
  required: string[];
  /** Whether other pins may get a label at all (false when zoomed out). */
  optional: boolean;
  /**
   * The clear part of the map in pixels: the canvas less whatever floats over it (the notice at the
   * top, the buttons on the right, the dock below). A label that would run past its right edge flips
   * to the left of its pin, and pins outside it are not named.
   */
  area: { left: number; top: number; right: number; bottom: number };
  /** Every other marker on screen (clusters, place markers), which a label must not cover. */
  obstacles?: { x: number; y: number; radius: number }[];
  /** Radius of a pin's tap area. */
  pinRadius?: number;
  /** The most optional labels to draw at once. */
  max?: number;
};

export type Placement = "right" | "left";

export type Box = { left: number; top: number; right: number; bottom: number };

export const overlaps = (a: Box, b: Box, gap = 4) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
export const circleBox = (x: number, y: number, r: number): Box => ({ left: x - r, right: x + r, top: y - r, bottom: y + r });

const LABEL_OFFSET = 12;
const LABEL_HEIGHT = 36;
const labelWidth = (name: string) => Math.ceil(name.length * 7.6) + 30;

/** The screen box a pin's name takes on the given side of it. */
export function labelBox(pin: Pin, side: Placement): Box {
  const w = labelWidth(pin.name);
  return side === "right"
    ? { left: pin.x + LABEL_OFFSET, right: pin.x + LABEL_OFFSET + w, top: pin.y - LABEL_HEIGHT / 2, bottom: pin.y + LABEL_HEIGHT / 2 }
    : { left: pin.x - LABEL_OFFSET - w, right: pin.x - LABEL_OFFSET, top: pin.y - LABEL_HEIGHT / 2, bottom: pin.y + LABEL_HEIGHT / 2 };
}

/**
 * Decides which pins get a name and on which side. Required pins come first, then the pins in the
 * clear area, from the middle of it outwards; an optional label is skipped when it would
 * overlap a label already placed or any marker.
 */
export function placeLabels(pins: Pin[], options: LabelOptions): Map<string, Placement> {
  const { required, optional, area, obstacles = [], pinRadius = 20, max = 8 } = options;
  const offset = LABEL_OFFSET;
  const width = labelWidth;
  const placed = new Map<string, Placement>();
  const boxes: Box[] = [];
  // Every marker a label must not cover. A pin's own tap area does not count against its label.
  const markers: { owner: string | null; box: Box }[] = [
    ...pins.map((pin) => ({ owner: pin.id, box: circleBox(pin.x, pin.y, pinRadius) })),
    ...obstacles.map((o) => ({ owner: null, box: circleBox(o.x, o.y, o.radius) })),
  ];

  const boxFor = labelBox;
  const sideFor = (pin: Pin): Placement => (pin.x + offset + width(pin.name) > area.right - 8 && pin.x - offset - width(pin.name) > area.left + 8 ? "left" : "right");

  for (const id of required) {
    const pin = pins.find((p) => p.id === id);
    if (!pin || placed.has(id)) continue;
    const side = sideFor(pin);
    placed.set(id, side);
    boxes.push(boxFor(pin, side));
  }
  if (!optional) return placed;

  const middle = { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
  const inArea = (pin: Pin) => pin.x >= area.left && pin.x <= area.right && pin.y >= area.top && pin.y <= area.bottom;
  const rest = pins.filter((pin) => !placed.has(pin.id) && inArea(pin)).sort((a, b) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(b.x - middle.x, b.y - middle.y) || a.id.localeCompare(b.id));
  let extra = 0;
  for (const pin of rest) {
    if (extra >= max) break;
    const side = sideFor(pin);
    const box = boxFor(pin, side);
    const hitsLabel = boxes.some((other) => overlaps(box, other));
    const hitsMarker = markers.some((marker) => marker.owner !== pin.id && overlaps(box, marker.box, 0));
    if (hitsLabel || hitsMarker) continue;
    placed.set(pin.id, side);
    boxes.push(box);
    extra += 1;
  }
  return placed;
}
