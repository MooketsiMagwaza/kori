/**
 * Sample sightings. Everything here is sample data: the species, counts, times, observers
 * ("Sample observer 1" and so on) and reviews, in the fictional sample reserve or on a real map.
 *
 * Times are relative to `now`, rounded down to ten minutes, so the sample always looks recent and
 * stays stable while a page is open. In the sample reserve, positions are generated near tracks,
 * because real sightings cluster along roads. A real park pack carries its own positions instead
 * (tools/map-pack/place-sightings.ts): the middle of a 1 km area on real ground near a track,
 * never on water and kept away from anything named after rhino. The exact point is what an
 * observer's phone recorded; only the observer and reviewers ever see it. Everyone else gets the
 * grid cell (see rules.ts).
 */

import type { LonLat } from "./geo.ts";
import { metersToDegrees } from "./geo.ts";
import { sampleReserve, visibleEdges } from "./reserve.ts";
import { cellFor, isPublic, ruleFor, sensitivityOf, type Cell, type SightingStatus } from "./rules.ts";

export type ReviewCheck = { id: string; label: string; passed: boolean; detail: string };

export type Sighting = {
  id: string;
  speciesId: string;
  count: number;
  seenAt: string;
  /** Exact point recorded by the observer's phone. Never published. */
  point: LonLat;
  accuracyMeters?: number;
  /** The published area (coarse grid cell). */
  cell: Cell;
  status: SightingStatus;
  denOrNest?: boolean;
  notes?: string;
  observer: string;
  photos: number;
  source: "sample" | "mine" | "shared";
  review?: { decidedAt: string; reviewer: string; reason?: string };
};

export type SampleSeed = {
  speciesId: string;
  count: number;
  minutesAgo: number;
  status: SightingStatus;
  observer: number;
  photos: number;
  notes?: string;
  denOrNest?: boolean;
  reason?: string;
};

// Hand-written so the sample tells a believable story; positions come from the seeded generator
// (sample reserve) or from the park pack (a real map).
export const SAMPLE_SEEDS: readonly SampleSeed[] = [
  { speciesId: "elephant", count: 14, minutesAgo: 25, status: "pending", observer: 1, photos: 2, notes: "Breeding herd crossing towards the pan. Two small calves." },
  { speciesId: "lion", count: 3, minutesAgo: 40, status: "pending", observer: 2, photos: 1, notes: "Two lionesses and a sub-adult resting under a camelthorn." },
  { speciesId: "wild-dog", count: 9, minutesAgo: 95, status: "approved", observer: 3, photos: 3, notes: "Pack moving fast along the track heading north." },
  { speciesId: "giraffe", count: 6, minutesAgo: 130, status: "approved", observer: 4, photos: 1 },
  { speciesId: "kori-bustard", count: 1, minutesAgo: 170, status: "approved", observer: 5, photos: 1, notes: "Male displaying, white neck feathers puffed out." },
  { speciesId: "gemsbok", count: 11, minutesAgo: 205, status: "approved", observer: 1, photos: 0 },
  { speciesId: "cheetah", count: 2, minutesAgo: 260, status: "approved", observer: 6, photos: 2, notes: "Two brothers on a termite mound scanning the pan." },
  { speciesId: "white-rhino", count: 2, minutesAgo: 300, status: "pending", observer: 2, photos: 1, notes: "Cow and calf." },
  { speciesId: "springbok", count: 40, minutesAgo: 330, status: "approved", observer: 4, photos: 0 },
  { speciesId: "leopard", count: 1, minutesAgo: 410, status: "approved", observer: 3, photos: 1, notes: "In a tree beside the dry river, with a kill." },
  { speciesId: "buffalo", count: 60, minutesAgo: 480, status: "rejected", observer: 5, photos: 1, reason: "The photo shows wildebeest, not buffalo. Please log it again as blue wildebeest." },
  { speciesId: "spotted-hyena", count: 4, minutesAgo: 600, status: "approved", observer: 6, photos: 0 },
  { speciesId: "wild-dog", count: 7, minutesAgo: 700, status: "approved", observer: 1, photos: 1, denOrNest: true, notes: "Pups seen at a den." },
  { speciesId: "ostrich", count: 3, minutesAgo: 820, status: "approved", observer: 2, photos: 0 },
  { speciesId: "kudu", count: 5, minutesAgo: 960, status: "approved", observer: 4, photos: 1 },
  { speciesId: "pangolin", count: 1, minutesAgo: 1_200, status: "pending", observer: 3, photos: 1, notes: "Crossing the track at dusk." },
  { speciesId: "elephant", count: 3, minutesAgo: 1_500, status: "approved", observer: 5, photos: 1, notes: "Three bulls at the water." },
  { speciesId: "wildebeest", count: 25, minutesAgo: 1_800, status: "approved", observer: 6, photos: 0 },
  { speciesId: "lion", count: 5, minutesAgo: 2_300, status: "approved", observer: 1, photos: 2, notes: "Pride on a gemsbok kill." },
  { speciesId: "zebra", count: 18, minutesAgo: 2_900, status: "approved", observer: 2, photos: 1 },
  { speciesId: "giraffe", count: 2, minutesAgo: 3_600, status: "rejected", observer: 3, photos: 0, reason: "Duplicate of an earlier report from the same vehicle." },
  { speciesId: "black-rhino", count: 1, minutesAgo: 8_000, status: "approved", observer: 4, photos: 1 },
  { speciesId: "cheetah", count: 1, minutesAgo: 9_500, status: "approved", observer: 5, photos: 1 },
  { speciesId: "impala", count: 30, minutesAgo: 11_000, status: "approved", observer: 6, photos: 0 },
];

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

/**
 * The sample sightings as of `now`. Same input, same output. `positions` (one per seed, from a real
 * park pack) replaces the generated positions in the sample reserve; any other length is ignored.
 */
export function sampleSightings(now: Date = new Date(), positions?: readonly LonLat[] | null): Sighting[] {
  const anchor = Math.floor(now.getTime() / 600_000) * 600_000;
  const reserve = sampleReserve();
  const tracks = visibleEdges(reserve, { predicted: false });
  const rand = mulberry32(7_102_026);
  const deg = metersToDegrees(reserve.centre[1]);
  const placed = positions && positions.length === SAMPLE_SEEDS.length ? positions : null;

  return SAMPLE_SEEDS.map((seed, index) => {
    // The same random draws happen either way, so accuracy and reviews do not depend on the map.
    const edge = tracks[Math.floor(rand() * tracks.length)];
    const at = edge.line[1 + Math.floor(rand() * (edge.line.length - 2))];
    const offset = 80 + rand() * 520;
    const angle = rand() * Math.PI * 2;
    const point: LonLat = placed
      ? [placed[index][0], placed[index][1]]
      : [Number((at[0] + Math.cos(angle) * offset * deg.lon).toFixed(6)), Number((at[1] + Math.sin(angle) * offset * deg.lat).toFixed(6))];
    const seenAt = new Date(anchor - seed.minutesAgo * 60_000).toISOString();
    const rule = ruleFor(seed);
    const decided = seed.status === "approved" || seed.status === "rejected";
    return {
      id: `s-${String(index + 1).padStart(3, "0")}`,
      speciesId: seed.speciesId,
      count: seed.count,
      seenAt,
      point,
      accuracyMeters: 5 + Math.round(rand() * 20),
      cell: cellFor(point, rule.cellMeters),
      status: seed.status,
      denOrNest: seed.denOrNest,
      notes: seed.notes,
      observer: `Sample observer ${seed.observer}`,
      photos: seed.photos,
      source: "sample" as const,
      review: decided
        ? { decidedAt: new Date(anchor - Math.max(5, seed.minutesAgo - 20) * 60_000).toISOString(), reviewer: "Sample reviewer", reason: seed.reason }
        : undefined,
    };
  });
}

/** What anyone else may see of a sighting: no exact point, no observer, time to the quarter hour. */
export type PublicSighting = {
  id: string;
  speciesId: string;
  count: number;
  seenAt: string;
  cell: Cell;
  status: "approved";
  sensitive: boolean;
};

export function toPublic(sighting: Sighting): PublicSighting {
  const quarter = 15 * 60_000;
  return {
    id: sighting.id,
    speciesId: sighting.speciesId,
    count: sighting.count,
    seenAt: new Date(Math.floor(Date.parse(sighting.seenAt) / quarter) * quarter).toISOString(),
    cell: sighting.cell,
    status: "approved",
    sensitive: sensitivityOf(sighting) === "sensitive",
  };
}

/** Sightings other people may see right now, newest first. */
export function publicSightings(all: Sighting[], now: Date = new Date()): PublicSighting[] {
  return all
    .filter((s) => isPublic(s, now))
    .sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt))
    .map(toPublic);
}

/** Automated checks shown to reviewers before a human decides. */
export function reviewChecks(sighting: Sighting, inside: boolean, now: Date = new Date()): ReviewCheck[] {
  const rule = ruleFor(sighting);
  const ageMinutes = (now.getTime() - Date.parse(sighting.seenAt)) / 60_000;
  return [
    { id: "inside", label: "Inside the reserve", passed: inside, detail: inside ? "The recorded point is inside the boundary." : "The recorded point is outside the boundary." },
    { id: "accuracy", label: "GPS accuracy", passed: (sighting.accuracyMeters ?? 999) <= 50, detail: `Reported accuracy ${sighting.accuracyMeters ?? "unknown"} m.` },
    { id: "count", label: "Plausible count", passed: sighting.count > 0 && sighting.count <= 500, detail: `${sighting.count} recorded.` },
    { id: "photo", label: "Photo attached", passed: sighting.photos > 0, detail: sighting.photos > 0 ? `${sighting.photos} photo(s), metadata removed on the phone.` : "No photo. Review from the description." },
    {
      id: "delay",
      label: "Publication delay",
      passed: ageMinutes >= rule.delayMinutes,
      detail: ageMinutes >= rule.delayMinutes ? "The delay has passed; approval publishes it at once." : "Approval will hold it until the delay has passed.",
    },
  ];
}
