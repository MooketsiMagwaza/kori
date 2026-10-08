/**
 * Routing on the phone over a reserve's track graph.
 *
 * Routes never leave the graph: the start and the end are snapped to the nearest point on a
 * routable track, and the path between them follows tracks only. Closed tracks are never used.
 * Predicted tracks are left out unless the caller switches them on, and low-confidence predictions
 * are never used. Costs prefer verified tracks over GPS-confirmed ones, and both over predictions.
 *
 * The approach (Dijkstra over a graph built from edges) follows the owner's earlier server-side
 * routing code (see PROVENANCE.md); this TypeScript version, the snapping and the cost model are new.
 */

import { distanceMeters, type LonLat } from "./geo.ts";
import type { Reserve, TrackEdge } from "./reserve.ts";

export type RouteOptions = {
  /** Allow predicted tracks with high (and, if minConfidence is "medium", medium) confidence. */
  includePredicted: boolean;
  minConfidence?: "high" | "medium";
};

export type Snap = { edgeId: string; index: number; at: LonLat; offsetMeters: number };

export type RouteResult = {
  line: LonLat[];
  lengthMeters: number;
  /** Metres of the route that run on predicted, unverified tracks. */
  predictedMeters: number;
  edgeIds: string[];
  start: Snap;
  end: Snap;
};

const FACTOR: Record<string, number> = { verified: 1, gps: 1.1, "predicted:high": 1.6, "predicted:medium": 2.2 };

function factor(edge: TrackEdge): number {
  return edge.status === "predicted" ? FACTOR[`predicted:${edge.confidence}`] ?? Number.POSITIVE_INFINITY : FACTOR[edge.status] ?? Number.POSITIVE_INFINITY;
}

export function routableEdges(reserve: Reserve, options: RouteOptions): TrackEdge[] {
  return reserve.edges.filter((edge) => {
    if (edge.status === "closed") return false;
    if (edge.status !== "predicted") return true;
    if (!options.includePredicted || edge.confidence === "low") return false;
    return edge.confidence === "high" || options.minConfidence === "medium";
  });
}

/** Nearest vertex of a routable track to a point. */
export function snapToTracks(edges: TrackEdge[], point: LonLat): Snap | null {
  let best: Snap | null = null;
  for (const edge of edges) {
    edge.line.forEach((vertex, index) => {
      const offset = distanceMeters(point, vertex);
      if (!best || offset < best.offsetMeters) best = { edgeId: edge.id, index, at: vertex, offsetMeters: offset };
    });
  }
  return best;
}

function cumulative(line: LonLat[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i += 1) out.push(out[i - 1] + distanceMeters(line[i - 1], line[i]));
  return out;
}

/** Shortest route along tracks between two points, or null when they are not connected. */
export function routeAlongTracks(reserve: Reserve, from: LonLat, to: LonLat, options: RouteOptions): RouteResult | null {
  const edges = routableEdges(reserve, options);
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  const start = snapToTracks(edges, from);
  const end = snapToTracks(edges, to);
  if (!start || !end) return null;

  const startEdge = byId.get(start.edgeId)!;
  const endEdge = byId.get(end.edgeId)!;
  const startCum = cumulative(startEdge.line);
  const endCum = cumulative(endEdge.line);
  const startTotal = startCum[startCum.length - 1];
  const endTotal = endCum[endCum.length - 1];

  // Adjacency list.
  const adjacent = new Map<string, { edge: TrackEdge; to: string }[]>();
  for (const edge of edges) {
    if (!adjacent.has(edge.from)) adjacent.set(edge.from, []);
    if (!adjacent.has(edge.to)) adjacent.set(edge.to, []);
    adjacent.get(edge.from)!.push({ edge, to: edge.to });
    adjacent.get(edge.to)!.push({ edge, to: edge.from });
  }

  // Multi-source Dijkstra: leaving the start point towards either end of its edge.
  const dist = new Map<string, number>();
  const prev = new Map<string, { node: string; edge: TrackEdge } | null>();
  const queue: { node: string; cost: number }[] = [];
  const push = (node: string, cost: number, via: { node: string; edge: TrackEdge } | null) => {
    if (cost >= (dist.get(node) ?? Number.POSITIVE_INFINITY)) return;
    dist.set(node, cost);
    prev.set(node, via);
    queue.push({ node, cost });
  };
  const f0 = factor(startEdge);
  push(startEdge.from, startCum[start.index] * f0, null);
  push(startEdge.to, (startTotal - startCum[start.index]) * f0, null);
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const { node, cost } = queue.shift()!;
    if (cost > (dist.get(node) ?? Number.POSITIVE_INFINITY)) continue;
    for (const { edge, to: next } of adjacent.get(node) ?? []) push(next, cost + edge.lengthMeters * factor(edge), { node, edge });
  }

  // Best way to arrive at the end point, from either end of its edge, or directly along one edge.
  const f1 = factor(endEdge);
  type Arrival = { kind: "node"; node: string; cost: number } | { kind: "direct"; cost: number };
  const arrivals: Arrival[] = [
    { kind: "node", node: endEdge.from, cost: (dist.get(endEdge.from) ?? Number.POSITIVE_INFINITY) + endCum[end.index] * f1 },
    { kind: "node", node: endEdge.to, cost: (dist.get(endEdge.to) ?? Number.POSITIVE_INFINITY) + (endTotal - endCum[end.index]) * f1 },
  ];
  if (startEdge.id === endEdge.id) arrivals.push({ kind: "direct", cost: Math.abs(startCum[start.index] - endCum[end.index]) * f0 });
  const best = arrivals.reduce((a, b) => (b.cost < a.cost ? b : a));
  if (!Number.isFinite(best.cost)) return null;

  const slice = (edge: TrackEdge, i: number, j: number): LonLat[] => (i <= j ? edge.line.slice(i, j + 1) : edge.line.slice(j, i + 1).reverse());
  let line: LonLat[] = [];
  const used: TrackEdge[] = [];
  let predictedMeters = 0;
  const addLength = (edge: TrackEdge, meters: number) => {
    if (edge.status === "predicted") predictedMeters += meters;
  };

  if (best.kind === "direct") {
    line = slice(startEdge, start.index, end.index);
    used.push(startEdge);
    addLength(startEdge, Math.abs(startCum[start.index] - endCum[end.index]));
  } else {
    // Walk back from the arrival node to the start.
    const chain: { from: string; edge: TrackEdge }[] = [];
    let node = best.node;
    while (prev.get(node)) {
      const step = prev.get(node)!;
      chain.unshift({ from: step.node, edge: step.edge });
      node = step.node;
    }
    const firstNode = node;
    // Start point to the first node, along the start edge.
    const toFirst = firstNode === startEdge.from ? slice(startEdge, start.index, 0) : slice(startEdge, start.index, startEdge.line.length - 1);
    line.push(...toFirst);
    used.push(startEdge);
    addLength(startEdge, firstNode === startEdge.from ? startCum[start.index] : startTotal - startCum[start.index]);
    for (const step of chain) {
      const oriented = step.from === step.edge.from ? step.edge.line : [...step.edge.line].reverse();
      line.push(...oriented.slice(1));
      used.push(step.edge);
      addLength(step.edge, step.edge.lengthMeters);
    }
    const lastNode = best.node;
    const fromLast = lastNode === endEdge.from ? slice(endEdge, 0, end.index) : slice(endEdge, endEdge.line.length - 1, end.index);
    line.push(...fromLast.slice(1));
    used.push(endEdge);
    addLength(endEdge, lastNode === endEdge.from ? endCum[end.index] : endTotal - endCum[end.index]);
  }

  let lengthMeters = 0;
  for (let i = 1; i < line.length; i += 1) lengthMeters += distanceMeters(line[i - 1], line[i]);
  const edgeIds = [...new Set(used.map((edge) => edge.id))];
  return { line, lengthMeters, predictedMeters, edgeIds, start, end };
}
