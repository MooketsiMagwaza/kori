/**
 * Private park packs served from the computer running the field app, for development only.
 *
 * Packs are never part of the app or its build: they stay in a folder outside the repository,
 * named by the KORI_LOCAL_PACKS_DIR environment variable on the machine that runs `next start`
 * (or `next dev`). With the variable unset, as on every deployed build, nothing is served and the
 * app uses the sample reserve. A real park is covered publicly only after DWNP agrees (KO-09,
 * KO-14), so never set the variable on a deployment.
 *
 * Only a pack folder name of lowercase letters, digits and dashes, and only the files a pack is
 * made of, are ever read.
 */

import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";

export const PACK_FILES: Record<string, string> = {
  "manifest.json": "application/json",
  "graph.json": "application/json",
  "sightings.json": "application/json",
  "base.pmtiles": "application/vnd.pmtiles",
  "imagery.pmtiles": "application/vnd.pmtiles",
};

const PACK_ID = /^[a-z0-9-]{1,40}$/;

export function packsDir(): string | null {
  const dir = process.env.KORI_LOCAL_PACKS_DIR;
  return dir ? resolve(dir) : null;
}

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function listPacks(): Promise<Response> {
  const dir = packsDir();
  if (!dir) return notFound();
  const packs = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !PACK_ID.test(entry.name)) continue;
    try {
      const manifest = JSON.parse(await readFile(join(dir, entry.name, "manifest.json"), "utf8")) as Record<string, unknown>;
      if (manifest.id !== entry.name) continue;
      packs.push({ id: manifest.id, name: manifest.name, version: manifest.version, totalBytes: manifest.totalBytes, built: manifest.built_utc, private: manifest.private !== false });
    } catch {
      /* not a pack */
    }
  }
  return Response.json({ packs }, { headers: { "Cache-Control": "no-store" } });
}

export async function packFile(pack: string, file: string): Promise<Response> {
  const dir = packsDir();
  if (!dir || !PACK_ID.test(pack) || !Object.hasOwn(PACK_FILES, file)) return notFound();
  const path = join(dir, pack, file);
  if (!path.startsWith(join(dir, pack))) return notFound();
  try {
    const info = await stat(path);
    if (!info.isFile()) return notFound();
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: { "Content-Type": PACK_FILES[file], "Content-Length": String(info.size), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  } catch {
    return notFound();
  }
}
