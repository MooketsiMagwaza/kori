/**
 * The field app's data layer. Screens talk only to this interface.
 *
 * Today it is implemented by LocalStore (IndexedDB in the browser, plus generated sample data).
 * When the Kori API exists, the same interface gains a server behind sync(); screens do not change.
 */

import type { LonLat } from "@/shared/geo.ts";
import type { Reserve } from "@/shared/reserve.ts";
import type { Sighting } from "@/shared/sample-sightings.ts";
import type { SharedSighting } from "@/shared/share-code.ts";

export type NewSighting = {
  speciesId: string;
  count: number;
  seenAt: string;
  point: LonLat;
  accuracyMeters?: number;
  denOrNest?: boolean;
  notes?: string;
  /** Already re-encoded on the phone (metadata removed). */
  photos: Blob[];
};

export type OutboxItem = { id: string; sightingId: string; queuedAt: string; attempts: number; lastError?: string };

export type PackRecord = {
  id: string;
  name: string;
  version: string;
  kind: "sample-geojson";
  bytes: number;
  downloadedAt: string;
  data: Reserve;
};

export type TripPoint = { t: number; lon: number; lat: number; acc: number };

export type Trip = {
  id: string;
  startedAt: string;
  endedAt?: string;
  /** When the person agreed to record this one trip. */
  consentAt: string;
  points: TripPoint[];
  shared: false;
};

export type SyncResult = { configured: boolean; sent: number; failed: number; message: string };

export interface KoriStore {
  /** Sample sightings, plus everything logged on or received by this phone. */
  listSightings(now: Date): Promise<Sighting[]>;
  getSighting(id: string, now: Date): Promise<Sighting | undefined>;
  logSighting(input: NewSighting): Promise<Sighting>;
  saveShared(shared: SharedSighting): Promise<Sighting>;
  deleteSighting(id: string): Promise<void>;
  photos(sightingId: string): Promise<Blob[]>;

  outbox(): Promise<OutboxItem[]>;
  sync(): Promise<SyncResult>;
  lastSyncAttempt(): Promise<string | null>;

  packs(): Promise<PackRecord[]>;
  getPack(id: string): Promise<PackRecord | undefined>;
  downloadPack(id: string, url: string): Promise<PackRecord>;
  deletePack(id: string): Promise<void>;

  trips(): Promise<Trip[]>;
  startTrip(): Promise<Trip>;
  addTripPoint(tripId: string, point: TripPoint): Promise<void>;
  endTrip(tripId: string): Promise<void>;
  deleteTrip(tripId: string): Promise<void>;

  /** Remove everything this phone stored (sightings, photos, packs, trips). */
  clearAll(): Promise<void>;
}

/** Fired on window after any write, so screens can refresh. */
export const CHANGED_EVENT = "kori:changed";
