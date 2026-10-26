/**
 * LocalStore: the KoriStore implementation used today.
 *
 * - Sample sightings are generated in the browser from shared/sample-sightings.ts and never stored.
 * - Sightings you log, codes you receive, photos, the outbox, downloaded packs and trips are stored
 *   in IndexedDB on this phone, so they survive with no signal and across restarts.
 * - The outbox replays with an idempotency key per sighting (the pattern comes from the owner's
 *   earlier offline outbox; see PROVENANCE.md), stopping at the first network failure so order
 *   is kept.
 * - A real park pack (private, from the computer serving the app) keeps its graph and sample
 *   positions here and its PMTiles files in OPFS, or here as Blobs where OPFS cannot be written
 *   (lib/pack-files.ts). While a real pack is the active one, the sample sightings sit on its
 *   real ground; otherwise they sit in the sample reserve, exactly as before.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LonLat } from "@/shared/geo.ts";
import { ruleFor, cellFor } from "@/shared/rules.ts";
import { SAMPLE_RESERVE_ID, type Reserve } from "@/shared/reserve.ts";
import { sampleSightings, type Sighting } from "@/shared/sample-sightings.ts";
import type { SharedSighting } from "@/shared/share-code.ts";
import { checkRoom, deleteOpfsPack, downloadFile, PackFileError, readOpfsFile } from "@/lib/pack-files";
import { API_URL, SendError, sendSighting } from "./remote";
import {
  CHANGED_EVENT,
  type KoriStore,
  type LocalPackListing,
  type NewSighting,
  type OutboxItem,
  type PackManifest,
  type PackProgress,
  type PackRecord,
  type RealPackRecord,
  type SyncResult,
  type Trip,
  type TripPoint,
} from "./types";

interface KoriDB extends DBSchema {
  sightings: { key: string; value: Sighting };
  photos: { key: string; value: { id: string; sightingId: string; blob: Blob }; indexes: { bySighting: string } };
  outbox: { key: string; value: OutboxItem };
  packs: { key: string; value: PackRecord };
  trips: { key: string; value: Trip };
  meta: { key: string; value: string };
  /** PMTiles files of real packs, where OPFS cannot be written. Key: "<pack id>/<file name>". */
  packFiles: { key: string; value: Blob };
}

const DB_NAME = "kori-field";
const DB_VERSION = 2;
const ACTIVE_KEY = "activePack";
/** Where the computer serving the app offers its private packs (404 on a deployed build). */
const LOCAL_PACKS = "/packs/local";
const SAMPLE_PACK_ID = SAMPLE_RESERVE_ID;

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export class LocalStore implements KoriStore {
  private db: Promise<IDBPDatabase<KoriDB>>;
  /** The active pack's sample positions, kept in memory so listing sightings stays cheap. */
  private positions: { key: string; value: LonLat[] | null } | null = null;

  constructor() {
    this.db = openDB<KoriDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("sightings", { keyPath: "id" });
          db.createObjectStore("photos", { keyPath: "id" }).createIndex("bySighting", "sightingId");
          db.createObjectStore("outbox", { keyPath: "id" });
          db.createObjectStore("packs", { keyPath: "id" });
          db.createObjectStore("trips", { keyPath: "id" });
          db.createObjectStore("meta");
        }
        if (oldVersion < 2) db.createObjectStore("packFiles");
      },
    });
  }

  /** Sample positions of the active real pack, or null for the sample reserve. */
  private async samplePositions(): Promise<LonLat[] | null> {
    const db = await this.db;
    const id = (await db.get("meta", ACTIVE_KEY)) ?? "";
    if (this.positions && this.positions.key === id) return this.positions.value;
    const pack = id ? await db.get("packs", id) : undefined;
    const value = pack && pack.kind === "pmtiles" && pack.complete ? pack.samplePositions : null;
    this.positions = { key: id, value };
    return value;
  }

  async listSightings(now: Date): Promise<Sighting[]> {
    const own = await (await this.db).getAll("sightings");
    return [...own, ...sampleSightings(now, await this.samplePositions())].sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt));
  }

  async getSighting(id: string, now: Date): Promise<Sighting | undefined> {
    const own = await (await this.db).get("sightings", id);
    return own ?? sampleSightings(now, await this.samplePositions()).find((s) => s.id === id);
  }

  async logSighting(input: NewSighting): Promise<Sighting> {
    const db = await this.db;
    const id = newId("me");
    const sighting: Sighting = {
      id,
      speciesId: input.speciesId,
      count: input.count,
      seenAt: input.seenAt,
      point: input.point,
      accuracyMeters: input.accuracyMeters,
      cell: cellFor(input.point, ruleFor(input).cellMeters),
      status: "queued",
      denOrNest: input.denOrNest,
      notes: input.notes,
      observer: "You",
      photos: input.photos.length,
      source: "mine",
    };
    const tx = db.transaction(["sightings", "photos", "outbox"], "readwrite");
    await tx.objectStore("sightings").put(sighting);
    for (const [index, blob] of input.photos.entries()) await tx.objectStore("photos").put({ id: `${id}-${index}`, sightingId: id, blob });
    // The outbox id doubles as the idempotency key sent to the server.
    await tx.objectStore("outbox").put({ id: newId("idem"), sightingId: id, queuedAt: new Date().toISOString(), attempts: 0 });
    await tx.done;
    changed();
    return sighting;
  }

  async saveShared(shared: SharedSighting): Promise<Sighting> {
    const db = await this.db;
    const sighting: Sighting = {
      id: newId("qr"),
      speciesId: shared.speciesId,
      count: shared.count,
      seenAt: shared.seenAt,
      point: shared.cell.centre,
      cell: shared.cell,
      status: shared.reviewed ? "approved" : "pending",
      observer: "Shared by QR code",
      photos: 0,
      source: "shared",
    };
    await db.put("sightings", sighting);
    changed();
    return sighting;
  }

  async deleteSighting(id: string): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(["sightings", "photos", "outbox"], "readwrite");
    await tx.objectStore("sightings").delete(id);
    for (const key of await tx.objectStore("photos").index("bySighting").getAllKeys(id)) await tx.objectStore("photos").delete(key);
    for (const item of await tx.objectStore("outbox").getAll()) if (item.sightingId === id) await tx.objectStore("outbox").delete(item.id);
    await tx.done;
    changed();
  }

  async photos(sightingId: string): Promise<Blob[]> {
    const rows = await (await this.db).getAllFromIndex("photos", "bySighting", sightingId);
    return rows.sort((a, b) => a.id.localeCompare(b.id)).map((row) => row.blob);
  }

  async outbox(): Promise<OutboxItem[]> {
    return (await (await this.db).getAll("outbox")).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  async lastSyncAttempt(): Promise<string | null> {
    return (await (await this.db).get("meta", "lastSyncAttempt")) ?? null;
  }

  async sync(): Promise<SyncResult> {
    const db = await this.db;
    await db.put("meta", new Date().toISOString(), "lastSyncAttempt");
    const queue = await this.outbox();
    if (!API_URL) {
      changed();
      return {
        configured: false,
        sent: 0,
        failed: 0,
        message: queue.length
          ? `No Kori server is connected in this prototype, so nothing was sent. Your ${queue.length} sighting${queue.length === 1 ? " is" : "s are"} safe on this phone.`
          : "Nothing waiting to send. No Kori server is connected in this prototype yet.",
      };
    }
    let sent = 0;
    let failed = 0;
    for (const item of queue) {
      const sighting = await db.get("sightings", item.sightingId);
      if (!sighting) {
        await db.delete("outbox", item.id);
        continue;
      }
      try {
        await sendSighting(sighting, item.id);
        await db.delete("outbox", item.id);
        await db.put("sightings", { ...sighting, status: "pending" });
        sent += 1;
      } catch (error) {
        const reason = error instanceof SendError ? error : new SendError(String(error), false);
        failed += 1;
        if (reason.permanent) await db.delete("outbox", item.id);
        else await db.put("outbox", { ...item, attempts: item.attempts + 1, lastError: reason.message });
        if (!reason.permanent) break;
      }
    }
    changed();
    return { configured: true, sent, failed, message: sent ? `Sent ${sent} sighting${sent === 1 ? "" : "s"} for review.` : "Nothing was sent. Try again with a connection." };
  }

  async packs(): Promise<PackRecord[]> {
    return (await this.db).getAll("packs");
  }

  async getPack(id: string): Promise<PackRecord | undefined> {
    return (await this.db).get("packs", id);
  }

  async downloadPack(id: string, url: string): Promise<PackRecord> {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`The pack could not be downloaded (${response.status}).`);
    const text = await response.text();
    const data = JSON.parse(text) as Reserve;
    const record: PackRecord = {
      id,
      name: data.name,
      version: data.version,
      kind: "sample-geojson",
      bytes: new Blob([text]).size,
      downloadedAt: new Date().toISOString(),
      data,
    };
    await (await this.db).put("packs", record);
    changed();
    return record;
  }

  async deletePack(id: string): Promise<void> {
    const db = await this.db;
    await deleteOpfsPack(id);
    const tx = db.transaction(["packs", "packFiles", "meta"], "readwrite");
    await tx.objectStore("packs").delete(id);
    for (const key of await tx.objectStore("packFiles").getAllKeys()) if (String(key).startsWith(`${id}/`)) await tx.objectStore("packFiles").delete(key);
    if ((await tx.objectStore("meta").get(ACTIVE_KEY)) === id) await tx.objectStore("meta").delete(ACTIVE_KEY);
    await tx.done;
    this.positions = null;
    changed();
  }

  async localPacks(): Promise<LocalPackListing[]> {
    try {
      const response = await fetch(LOCAL_PACKS, { cache: "no-store" });
      if (!response.ok) return [];
      const body = (await response.json()) as { packs?: LocalPackListing[] };
      return Array.isArray(body.packs) ? body.packs : [];
    } catch {
      return [];
    }
  }

  async downloadRealPack(id: string, onProgress?: (progress: PackProgress) => void): Promise<RealPackRecord> {
    const db = await this.db;
    const base = `${LOCAL_PACKS}/${encodeURIComponent(id)}`;
    let manifest: PackManifest;
    try {
      const response = await fetch(`${base}/manifest.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      manifest = (await response.json()) as PackManifest;
    } catch {
      throw new PackFileError("The pack's description could not be read from the computer serving it.", "network");
    }
    if (manifest.id !== id || manifest.kind !== "real") throw new PackFileError("That is not a Kori park pack.", "integrity");
    await checkRoom(manifest.totalBytes);

    // Start clean: an earlier, partial download of this pack is removed first.
    await this.deletePack(id);
    const record: RealPackRecord = {
      id,
      name: manifest.name,
      version: manifest.version,
      kind: "pmtiles",
      bytes: manifest.totalBytes,
      downloadedAt: new Date().toISOString(),
      complete: false,
      storage: "opfs",
      manifest,
      data: { id, name: manifest.name, version: manifest.version, notice: manifest.notice, centre: manifest.centre, bounds: manifest.bounds, boundary: [], pans: [], river: [], nodes: [], edges: [], kind: "real" },
      samplePositions: null,
    };
    await db.put("packs", record);
    changed();

    let overall = 0;
    try {
      for (const file of manifest.files) {
        const before = overall;
        const report = (received: number) => onProgress?.({ file: file.name, received, total: file.bytes, overall: before + received, overallTotal: manifest.totalBytes });
        if (file.role === "base" || file.role === "imagery") {
          const result = await downloadFile(`${base}/${file.name}`, id, file.name, file, (blob) => db.put("packFiles", blob, `${id}/${file.name}`).then(() => undefined), report);
          record.storage = result.storage;
        } else {
          const response = await fetch(`${base}/${file.name}`, { cache: "no-store" }).catch(() => null);
          if (!response?.ok) throw new PackFileError(`${file.name} could not be downloaded.`, "network");
          const text = await response.text();
          report(new Blob([text]).size);
          if (file.role === "graph") record.data = { ...(JSON.parse(text) as Reserve), kind: "real" };
          if (file.role === "sightings") record.samplePositions = (JSON.parse(text) as { positions: LonLat[] }).positions;
        }
        overall += file.bytes;
      }
    } catch (error) {
      // Leave nothing half-written: the record says incomplete only if removing it fails.
      await this.deletePack(id).catch(() => undefined);
      throw error;
    }
    record.complete = true;
    record.downloadedAt = new Date().toISOString();
    await db.put("packs", record);
    await db.put("meta", id, ACTIVE_KEY);
    this.positions = null;
    await navigator.storage?.persist?.().catch(() => false);
    changed();
    return record;
  }

  async packFile(id: string, name: string): Promise<Blob | null> {
    const db = await this.db;
    const pack = await db.get("packs", id);
    if (!pack || pack.kind !== "pmtiles" || !pack.complete) return null;
    if (pack.storage === "opfs") return readOpfsFile(id, name);
    return (await db.get("packFiles", `${id}/${name}`)) ?? null;
  }

  async activePack(): Promise<PackRecord | null> {
    const db = await this.db;
    const id = await db.get("meta", ACTIVE_KEY);
    const chosen = id ? await db.get("packs", id) : undefined;
    if (chosen && (chosen.kind !== "pmtiles" || chosen.complete)) return chosen;
    return (await db.get("packs", SAMPLE_PACK_ID)) ?? null;
  }

  async setActivePack(id: string | null): Promise<void> {
    const db = await this.db;
    if (id) await db.put("meta", id, ACTIVE_KEY);
    else await db.delete("meta", ACTIVE_KEY);
    this.positions = null;
    changed();
  }

  async trips(): Promise<Trip[]> {
    return (await (await this.db).getAll("trips")).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async startTrip(): Promise<Trip> {
    const now = new Date().toISOString();
    const trip: Trip = { id: newId("trip"), startedAt: now, consentAt: now, points: [], shared: false };
    await (await this.db).put("trips", trip);
    changed();
    return trip;
  }

  async addTripPoint(tripId: string, point: TripPoint): Promise<void> {
    const db = await this.db;
    const trip = await db.get("trips", tripId);
    if (!trip || trip.endedAt) return;
    trip.points.push(point);
    await db.put("trips", trip);
    changed();
  }

  async endTrip(tripId: string): Promise<void> {
    const db = await this.db;
    const trip = await db.get("trips", tripId);
    if (!trip) return;
    await db.put("trips", { ...trip, endedAt: new Date().toISOString() });
    changed();
  }

  async deleteTrip(tripId: string): Promise<void> {
    await (await this.db).delete("trips", tripId);
    changed();
  }

  async clearAll(): Promise<void> {
    const db = await this.db;
    for (const pack of await db.getAll("packs")) if (pack.kind === "pmtiles") await deleteOpfsPack(pack.id);
    const tx = db.transaction(["sightings", "photos", "outbox", "packs", "trips", "meta", "packFiles"], "readwrite");
    await Promise.all([
      tx.objectStore("sightings").clear(),
      tx.objectStore("photos").clear(),
      tx.objectStore("outbox").clear(),
      tx.objectStore("packs").clear(),
      tx.objectStore("trips").clear(),
      tx.objectStore("meta").clear(),
      tx.objectStore("packFiles").clear(),
    ]);
    await tx.done;
    this.positions = null;
    changed();
  }
}
