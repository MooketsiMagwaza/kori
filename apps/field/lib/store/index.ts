/**
 * The one store the app uses. Created lazily in the browser; never on the server.
 *
 * NEXT_PUBLIC_KORI_DATA_SOURCE picks the implementation at build time:
 *   - "local" (default): LocalStore, IndexedDB and sample data only;
 *   - "http": HttpStore, the same plus the Kori API where reachable (a scaffold; see http-store.ts).
 */

import { HttpStore } from "./http-store";
import { LocalStore } from "./local-store";
import type { KoriStore } from "./types";

export const DATA_SOURCE = process.env.NEXT_PUBLIC_KORI_DATA_SOURCE === "http" ? "http" : "local";

let store: KoriStore | null = null;

export function getStore(): KoriStore {
  if (typeof window === "undefined") throw new Error("The Kori store only runs in the browser.");
  store ??= DATA_SOURCE === "http" ? new HttpStore() : new LocalStore();
  return store;
}

export * from "./types";
