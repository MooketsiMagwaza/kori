/**
 * Sharing a sighting with no signal: the sighting travels inside a link, and the link inside a QR
 * code. Scanning it opens Kori's /shared page, which decodes it on the phone; nothing goes to a
 * server.
 *
 * The code carries only what publication allows: species, count, time to the quarter hour, and the
 * grid cell. Never the exact point, never the observer. Sensitive sightings are refused before
 * this is called (rules.ts, canShare), and decode() refuses them again.
 */

import type { LonLat } from "./geo.ts";
import { sensitivityOf, type Cell } from "./rules.ts";
import { speciesById } from "./species.ts";

export const SHARE_PREFIX = "k1.";

export type SharedSighting = {
  speciesId: string;
  count: number;
  seenAt: string;
  cell: Cell;
  reviewed: boolean;
};

type Wire = { s: string; n: number; t: number; c: [number, number]; z: number; r: 0 | 1 };

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const padded = code.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((code.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeShare(shared: SharedSighting): string {
  const quarter = 15 * 60_000;
  const wire: Wire = {
    s: shared.speciesId,
    n: shared.count,
    t: Math.floor(Date.parse(shared.seenAt) / quarter) * 15,
    c: [Number(shared.cell.centre[0].toFixed(4)), Number(shared.cell.centre[1].toFixed(4))],
    z: shared.cell.sizeMeters,
    r: shared.reviewed ? 1 : 0,
  };
  return SHARE_PREFIX + toBase64Url(JSON.stringify(wire));
}

/** Full link for a QR code. */
export function shareLink(origin: string, shared: SharedSighting): string {
  return `${origin.replace(/\/$/, "")}/shared#${encodeShare(shared)}`;
}

export type DecodeResult = { ok: true; sighting: SharedSighting } | { ok: false; reason: string };

/** Decode and validate a code or a full link. Rejects anything malformed, out of range or sensitive. */
export function decodeShare(input: string): DecodeResult {
  const hash = input.includes("#") ? input.slice(input.indexOf("#") + 1) : input;
  if (!hash.startsWith(SHARE_PREFIX)) return { ok: false, reason: "This is not a Kori sighting code." };
  let wire: Wire;
  try {
    wire = JSON.parse(fromBase64Url(hash.slice(SHARE_PREFIX.length))) as Wire;
  } catch {
    return { ok: false, reason: "The code is damaged and could not be read." };
  }
  const species = typeof wire.s === "string" ? speciesById(wire.s) : undefined;
  if (!species) return { ok: false, reason: "The code names a species Kori does not know." };
  if (sensitivityOf({ speciesId: wire.s }) === "sensitive") return { ok: false, reason: "Sensitive species are never shared by code." };
  const [lon, lat] = Array.isArray(wire.c) ? wire.c : [NaN, NaN];
  // Botswana's extent, with a margin.
  if (!(lon >= 19.5 && lon <= 29.8 && lat >= -27.2 && lat <= -17.4)) return { ok: false, reason: "The location in the code is outside Botswana." };
  if (!Number.isInteger(wire.n) || wire.n < 1 || wire.n > 1000) return { ok: false, reason: "The count in the code is not valid." };
  if (![1_000, 2_000, 5_000].includes(wire.z)) return { ok: false, reason: "The area size in the code is not valid." };
  const minutes = Number(wire.t);
  if (!Number.isFinite(minutes) || minutes <= 0) return { ok: false, reason: "The time in the code is not valid." };
  const centre: LonLat = [lon, lat];
  return {
    ok: true,
    sighting: {
      speciesId: wire.s,
      count: wire.n,
      seenAt: new Date(minutes * 60_000).toISOString(),
      cell: { id: `shared:${lon}:${lat}:${wire.z}`, centre, sizeMeters: wire.z },
      reviewed: wire.r === 1,
    },
  };
}
