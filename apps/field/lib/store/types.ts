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

export type SamplePackRecord = {
  id: string;
  name: string;
  version: string;
  kind: "sample-geojson";
  bytes: number;
  downloadedAt: string;
  data: Reserve;
};

/** One file of a real pack as its manifest lists it. */
export type PackManifestFile = { name: string; role: "base" | "imagery" | "graph" | "sightings"; bytes: number; sha256: string };

/** What a real pack's manifest.json says about itself (the parts the app reads). */
export type PackManifest = {
  format: string;
  id: string;
  name: string;
  version: string;
  kind: "real";
  private: boolean;
  notice: string;
  built_utc: string;
  bounds: [number, number, number, number];
  centre: LonLat;
  imageryBounds?: [number, number, number, number];
  files: PackManifestFile[];
  totalBytes: number;
  credits: string[];
  licences: Record<string, string>;
  sources: Record<string, unknown>[];
  imagery?: { note?: string };
};

/**
 * A real park pack (private, served from the owner's own computer): the track graph and sample
 * sighting positions in IndexedDB, the PMTiles files in OPFS or IndexedDB (lib/pack-files.ts).
 * `complete` is false while a download is under way or after one failed part way; such a pack is
 * never drawn.
 */
export type RealPackRecord = {
  id: string;
  name: string;
  version: string;
  kind: "pmtiles";
  bytes: number;
  downloadedAt: string;
  complete: boolean;
  storage: "opfs" | "idb";
  manifest: PackManifest;
  data: Reserve;
  /** One position per sample seed, the middle of a 1 km area on real ground. */
  samplePositions: LonLat[] | null;
};

export type PackRecord = SamplePackRecord | RealPackRecord;

/** A real pack offered by the computer serving the app (only on a machine with local packs). */
export type LocalPackListing = { id: string; name: string; version: string; totalBytes: number; built: string; private: boolean };

export type PackProgress = { file: string; received: number; total: number; overall: number; overallTotal: number };

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
  /** Download the sample reserve (one JSON file). */
  downloadPack(id: string, url: string): Promise<PackRecord>;
  /** Delete a pack and every file it stored. */
  deletePack(id: string): Promise<void>;
  /** Real packs the computer serving the app offers (empty on a deployed build). */
  localPacks(): Promise<LocalPackListing[]>;
  /** Download a real pack into this phone's storage, file by file, verified against its manifest. */
  downloadRealPack(id: string, onProgress?: (progress: PackProgress) => void): Promise<RealPackRecord>;
  /** A stored PMTiles file of a complete real pack, or null. */
  packFile(id: string, name: string): Promise<Blob | null>;
  /** The pack the map draws: the chosen real pack if it is complete, else the sample reserve, else nothing. */
  activePack(): Promise<PackRecord | null>;
  /** Choose which downloaded pack the map draws (null: the sample reserve). */
  setActivePack(id: string | null): Promise<void>;

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
