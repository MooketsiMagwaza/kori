/**
 * HttpStore: the KoriStore implementation that talks to the Kori API. SCAFFOLD.
 *
 * Chosen with NEXT_PUBLIC_KORI_DATA_SOURCE=http (see lib/store/index.ts); the default is LocalStore.
 * It stays offline-first: everything is still written to IndexedDB through LocalStore first, and the
 * server is only read when online. What it adds:
 *   - your own sightings' review status comes from GET /api/sightings/mine;
 *   - a sighting the phone does not have is fetched from the server;
 *   - sync() sends the outbox (LocalStore already does this when NEXT_PUBLIC_KORI_API_URL is set).
 *
 * Not done yet, and why it is a scaffold: there is no sign-in in the field app, so requests carry
 * no token and the API answers 401; trips are not shared; photos are not uploaded. It has not been
 * run against the API.
 */

import type { Sighting } from "@/shared/sample-sightings.ts";
import { LocalStore } from "./local-store";
import { API_URL } from "./remote";
import type { KoriStore } from "./types";

type ServerSighting = {
  id: string;
  speciesId: string;
  count: number;
  seenAt: string;
  point: { lon: number; lat: number; accuracyM: number | null };
  area: { cell: string; centre: { lon: number; lat: number }; sizeM: number };
  status: Sighting["status"];
  visibleFrom: string;
};

/** Where a signed-in session's token will come from once the field app has sign-in (not built). */
function accessToken(): string | null {
  return null;
}

async function getJson<T>(path: string): Promise<T | null> {
  if (!API_URL || (typeof navigator !== "undefined" && !navigator.onLine)) return null;
  const token = accessToken();
  try {
    const response = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

function fromServer(item: ServerSighting): Sighting {
  return {
    id: `srv-${item.id}`,
    speciesId: item.speciesId,
    count: item.count,
    seenAt: item.seenAt,
    point: [item.point.lon, item.point.lat],
    accuracyMeters: item.point.accuracyM ?? undefined,
    cell: { id: item.area.cell, centre: [item.area.centre.lon, item.area.centre.lat], sizeMeters: item.area.sizeM },
    status: item.status,
    observer: "You",
    photos: 0,
    source: "mine",
  };
}

export class HttpStore extends LocalStore implements KoriStore {
  async listSightings(now: Date): Promise<Sighting[]> {
    const local = await super.listSightings(now);
    const remote = await getJson<ServerSighting[]>("/api/sightings/mine");
    if (!remote) return local;
    const seen = new Set(local.map((s) => s.id));
    return [...local, ...remote.map(fromServer).filter((s) => !seen.has(s.id))].sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt));
  }

  async getSighting(id: string, now: Date): Promise<Sighting | undefined> {
    const local = await super.getSighting(id, now);
    if (local || !id.startsWith("srv-")) return local;
    const mine = await getJson<ServerSighting[]>("/api/sightings/mine");
    return mine?.map(fromServer).find((s) => s.id === id);
  }
}
