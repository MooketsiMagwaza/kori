/**
 * Publication rules for sightings: how coarse, how late, and whether guidance or a QR share is
 * allowed. These implement docs/SAFETY_AND_PRIVACY.md. The numbers are proposals, to be agreed with
 * the Department of Wildlife and National Parks before any park is covered publicly.
 */

import type { LonLat } from "./geo.ts";
import { metersToDegrees } from "./geo.ts";
import { speciesById, type Sensitivity } from "./species.ts";

export type Rule = {
  /** Side of the published grid cell, in metres. */
  cellMeters: number;
  /** Minimum time between the sighting and anyone else seeing it. */
  delayMinutes: number;
  /** Whether the app may route someone to it (always along tracks). */
  guidance: boolean;
  /** Whether it may be shared phone to phone with a QR code. */
  qrShare: boolean;
};

export const RULES: Record<Sensitivity, Rule> = {
  standard: { cellMeters: 1_000, delayMinutes: 60, guidance: true, qrShare: true },
  sensitive: { cellMeters: 10_000, delayMinutes: 7 * 24 * 60, guidance: false, qrShare: false },
};

export type Cell = {
  id: string;
  /** Cell centre, [longitude, latitude]. */
  centre: LonLat;
  sizeMeters: number;
};

export type SightingStatus = "queued" | "pending" | "approved" | "rejected";

/** The minimum a rule check needs to know about a sighting. */
export type RuleInput = {
  speciesId: string;
  seenAt: string;
  status: SightingStatus;
  denOrNest?: boolean;
};

/** Den and nest reports are sensitive whatever the species. Unknown species are treated as sensitive. */
export function sensitivityOf(input: Pick<RuleInput, "speciesId" | "denOrNest">): Sensitivity {
  if (input.denOrNest) return "sensitive";
  return speciesById(input.speciesId)?.sensitivity ?? "sensitive";
}

export function ruleFor(input: Pick<RuleInput, "speciesId" | "denOrNest">): Rule {
  return RULES[sensitivityOf(input)];
}

/**
 * Snap a point to the centre of its grid cell. The grid is fixed in degrees from a reference
 * latitude for the whole country, so the same point always lands in the same cell.
 */
export function cellFor(point: LonLat, sizeMeters: number): Cell {
  const deg = metersToDegrees(-22);
  const stepLon = sizeMeters * deg.lon;
  const stepLat = sizeMeters * deg.lat;
  const col = Math.floor(point[0] / stepLon);
  const row = Math.floor(point[1] / stepLat);
  const centre: LonLat = [Number(((col + 0.5) * stepLon).toFixed(5)), Number(((row + 0.5) * stepLat).toFixed(5))];
  return { id: `c${sizeMeters}:${col}:${row}`, centre, sizeMeters };
}

/** The four corners of a cell, closed, as a GeoJSON ring. */
export function cellRing(cell: Cell): LonLat[] {
  const deg = metersToDegrees(-22);
  const halfLon = (cell.sizeMeters * deg.lon) / 2;
  const halfLat = (cell.sizeMeters * deg.lat) / 2;
  const [lon, lat] = cell.centre;
  return [
    [lon - halfLon, lat - halfLat],
    [lon + halfLon, lat - halfLat],
    [lon + halfLon, lat + halfLat],
    [lon - halfLon, lat + halfLat],
    [lon - halfLon, lat - halfLat],
  ];
}

/** When other people may first see this sighting. */
export function visibleFrom(input: RuleInput): Date {
  return new Date(Date.parse(input.seenAt) + ruleFor(input).delayMinutes * 60_000);
}

/** True when the sighting is approved and its delay has passed. */
export function isPublic(input: RuleInput, now: Date = new Date()): boolean {
  return input.status === "approved" && now.getTime() >= visibleFrom(input).getTime();
}

export type Permission = { ok: true } | { ok: false; reason: string };

function waitReason(input: RuleInput, what: string): string {
  const at = visibleFrom(input);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(at);
  return `${what} opens at ${time}, ${ruleFor(input).delayMinutes >= 1440 ? "7 days" : "1 hour"} after the sighting, so no live location leaves this phone.`;
}

/** May the app route someone to this sighting? Always along tracks, never to the animal itself. */
export function canGuide(input: RuleInput, now: Date = new Date()): Permission {
  const rule = ruleFor(input);
  if (!rule.guidance) return { ok: false, reason: "Kori never guides anyone to a sensitive species, a den or a nest." };
  if (input.status === "rejected") return { ok: false, reason: "This sighting was rejected in review." };
  if (now.getTime() < visibleFrom(input).getTime()) return { ok: false, reason: waitReason(input, "Guidance") };
  return { ok: true };
}

/** May this sighting be shared phone to phone? Same rules as publication. */
export function canShare(input: RuleInput, now: Date = new Date()): Permission {
  const rule = ruleFor(input);
  if (!rule.qrShare) return { ok: false, reason: "Sensitive species, dens and nests are never shared by QR code." };
  if (input.status === "rejected") return { ok: false, reason: "Rejected sightings are not shared." };
  if (now.getTime() < visibleFrom(input).getTime()) return { ok: false, reason: waitReason(input, "Sharing") };
  return { ok: true };
}
