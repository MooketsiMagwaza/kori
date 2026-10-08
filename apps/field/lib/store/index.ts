/** The one store the app uses. Created lazily in the browser; never on the server. */

import { LocalStore } from "./local-store";
import type { KoriStore } from "./types";

let store: KoriStore | null = null;

export function getStore(): KoriStore {
  if (typeof window === "undefined") throw new Error("The Kori store only runs in the browser.");
  store ??= new LocalStore();
  return store;
}

export * from "./types";
