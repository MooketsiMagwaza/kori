/**
 * A park pack's big files (the vector base map and the satellite imagery, both PMTiles) kept in the
 * phone's own storage, and read back by byte range so MapLibre draws them with no network.
 *
 * Where they live:
 *   - the origin private file system (OPFS) when the browser can write files there (Chrome,
 *     Edge, Android browsers, recent Safari): `packs/<pack id>/<file>`;
 *   - otherwise IndexedDB, as one Blob per file (the `packFiles` store in local-store.ts).
 *
 * Writing is all or nothing per file: OPFS keeps the old contents until the writable stream is
 * closed, and the IndexedDB Blob is written only once complete. Each file's size and SHA-256 are
 * checked against the pack's manifest before the pack is marked complete; a pack that is not
 * complete is never drawn (the packs screen offers to retry or delete it).
 *
 * PMTiles reads small ranges (a header, directories, then tiles). `BlobSource` answers each with
 * `Blob.slice`, which reads only that part of the file from disk.
 */

import type { RangeResponse, Source } from "pmtiles";

export type FileStorage = "opfs" | "idb";

/** A friendly error for the screens, with the original kept for the console. */
export class PackFileError extends Error {
  constructor(
    message: string,
    readonly reason: "quota" | "network" | "integrity" | "storage",
  ) {
    super(message);
  }
}

type WritableFile = FileSystemFileHandle & { createWritable?: () => Promise<FileSystemWritableFileStream> };

let opfsChecked: Promise<boolean> | null = null;

/** True when this browser can write files into the origin private file system from the page. */
export function opfsWritable(): Promise<boolean> {
  opfsChecked ??= (async () => {
    try {
      if (!navigator.storage?.getDirectory) return false;
      const root = await navigator.storage.getDirectory();
      const probe = (await root.getFileHandle(".kori-probe", { create: true })) as WritableFile;
      const ok = typeof probe.createWritable === "function";
      await root.removeEntry(".kori-probe").catch(() => undefined);
      return ok;
    } catch {
      return false;
    }
  })();
  return opfsChecked;
}

async function packDir(packId: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const packs = await root.getDirectoryHandle("packs", { create });
    return await packs.getDirectoryHandle(packId, { create });
  } catch {
    return null;
  }
}

const isQuota = (error: unknown) => error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22);

export function quotaMessage(bytes: number): string {
  return `Not enough free space on this phone for the pack (it needs about ${Math.ceil(bytes / 1_048_576)} MB). Free some space or delete another pack, then try again.`;
}

/** Throws a PackFileError when the browser says there is clearly not enough room. */
export async function checkRoom(bytes: number): Promise<void> {
  if (!navigator.storage?.estimate) return;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  if (quota && quota - usage < bytes * 1.1) throw new PackFileError(quotaMessage(bytes), "quota");
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type WriteResult = { storage: FileStorage; blob: Blob | null };

/**
 * Download one file into storage. `putIdb` stores a Blob in IndexedDB when OPFS is not writable.
 * Reports progress in bytes. Verifies size and SHA-256; on any failure nothing is left behind.
 */
export async function downloadFile(
  url: string,
  packId: string,
  name: string,
  expected: { bytes: number; sha256: string },
  putIdb: (blob: Blob) => Promise<void>,
  onBytes: (received: number) => void,
  signal?: AbortSignal,
): Promise<WriteResult> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal });
  } catch {
    throw new PackFileError("The download stopped: no connection to the computer serving the pack.", "network");
  }
  if (!response.ok || !response.body) throw new PackFileError(`The pack could not be downloaded (${response.status}).`, "network");

  const useOpfs = await opfsWritable();
  const reader = response.body.getReader();
  let received = 0;

  if (useOpfs) {
    const dir = await packDir(packId, true);
    if (!dir) throw new PackFileError("This browser would not let Kori store the pack.", "storage");
    const handle = (await dir.getFileHandle(name, { create: true })) as WritableFile;
    const writable = await handle.createWritable!();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value as Uint8Array<ArrayBuffer>);
        received += value.byteLength;
        onBytes(received);
      }
      if (received !== expected.bytes) throw new PackFileError(`The download was cut short (${received} of ${expected.bytes} bytes). Try again with a steady connection.`, "network");
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      await dir.removeEntry(name).catch(() => undefined);
      if (isQuota(error)) throw new PackFileError(quotaMessage(expected.bytes), "quota");
      if (error instanceof PackFileError) throw error;
      throw new PackFileError("The download stopped before the end. Try again with a steady connection.", "network");
    }
    const file = await handle.getFile();
    if ((await sha256Hex(file)) !== expected.sha256) {
      await dir.removeEntry(name).catch(() => undefined);
      throw new PackFileError(`${name} arrived damaged (its checksum does not match). Try again.`, "integrity");
    }
    return { storage: "opfs", blob: null };
  }

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array<ArrayBuffer>);
      received += value.byteLength;
      onBytes(received);
    }
  } catch {
    throw new PackFileError("The download stopped before the end. Try again with a steady connection.", "network");
  }
  if (received !== expected.bytes) throw new PackFileError(`The download was cut short (${received} of ${expected.bytes} bytes). Try again with a steady connection.`, "network");
  const blob = new Blob(chunks);
  if ((await sha256Hex(blob)) !== expected.sha256) throw new PackFileError(`${name} arrived damaged (its checksum does not match). Try again.`, "integrity");
  try {
    await putIdb(blob);
  } catch (error) {
    if (isQuota(error) || (error instanceof DOMException && error.name === "QuotaExceededError")) throw new PackFileError(quotaMessage(expected.bytes), "quota");
    throw new PackFileError("This browser would not let Kori store the pack.", "storage");
  }
  return { storage: "idb", blob };
}

/** The stored file from OPFS, or null when it is not there. */
export async function readOpfsFile(packId: string, name: string): Promise<File | null> {
  const dir = await packDir(packId, false);
  if (!dir) return null;
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

/** Remove a pack's folder from OPFS (IndexedDB Blobs are removed by the store). */
export async function deleteOpfsPack(packId: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const packs = await root.getDirectoryHandle("packs");
    await packs.removeEntry(packId, { recursive: true });
  } catch {
    /* nothing stored, or no OPFS */
  }
}

/** A PMTiles source that reads byte ranges from a stored Blob or File. No network. */
export class BlobSource implements Source {
  constructor(
    private readonly blob: Blob,
    private readonly key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = await this.blob.slice(offset, offset + length).arrayBuffer();
    return { data };
  }
}
