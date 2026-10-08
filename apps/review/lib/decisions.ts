"use client";

/**
 * Review decisions made in this prototype. They are stored in this browser only (localStorage), so
 * they never reach anyone else and the sample queue resets when the storage is cleared. With the
 * API (KO-08) the same calls go to the moderation endpoints and the server's append-only audit log.
 */

import { useSyncExternalStore } from "react";

export type Decision = { id: string; status: "approved" | "rejected"; reason?: string; at: string };

const KEY = "kori-review-decisions";
const EVENT = "kori-review:changed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function snapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** All decisions made in this browser, oldest first. */
export function useDecisions(): Decision[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  try {
    return JSON.parse(raw) as Decision[];
  } catch {
    return [];
  }
}

export function decide(decision: Omit<Decision, "at">) {
  const all = JSON.parse(snapshot()) as Decision[];
  all.push({ ...decision, at: new Date().toISOString() });
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: the decision lasts for this page view only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearDecisions() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The latest decision per sighting. */
export function latestById(decisions: Decision[]): Map<string, Decision> {
  const map = new Map<string, Decision>();
  for (const d of decisions) map.set(d.id, d);
  return map;
}
