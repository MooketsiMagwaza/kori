"use client";

/** Small hooks shared by the field app's screens. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CHANGED_EVENT, getStore, type KoriStore, type PackRecord } from "@/lib/store";

/** Load data from the store, and reload whenever anything in the store changes. */
export function useStoreData<T>(load: (store: KoriStore) => Promise<T>, deps: unknown[] = []): { data: T | undefined; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let alive = true;
    loadRef
      .current(getStore())
      .then((value) => {
        if (alive) {
          setData(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    window.addEventListener(CHANGED_EVENT, bump);
    return () => window.removeEventListener(CHANGED_EVENT, bump);
  }, []);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, reload };
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** True while the browser reports a connection. Server render assumes online. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** The current time, refreshed every `everyMs`. Undefined until mounted, so server and client agree. */
export function useNow(everyMs = 30_000): Date | undefined {
  const [now, setNow] = useState<Date | undefined>(undefined);
  useEffect(() => {
    const update = () => setNow(new Date());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, everyMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [everyMs]);
  return now;
}

export type Fix = { lon: number; lat: number; accuracy: number; at: number };
export type GeoState = { fix: Fix | null; status: "off" | "waiting" | "live" | "denied" | "unavailable"; message: string | null };

/**
 * Follow the phone's GPS while `enabled`. GPS needs no mobile signal; the first fix can take longer
 * without network help.
 */
export function useGeolocation(enabled: boolean): GeoState {
  const [state, setState] = useState<GeoState>({ fix: null, status: "off", message: null });
  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      const t = window.setTimeout(() => setState({ fix: null, status: "unavailable", message: "This browser cannot read your position." }), 0);
      return () => window.clearTimeout(t);
    }
    const start = window.setTimeout(() => setState((s) => ({ ...s, status: s.fix ? s.status : "waiting", message: null })), 0);
    const id = navigator.geolocation.watchPosition(
      (pos) => setState({ fix: { lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, at: pos.timestamp }, status: "live", message: null }),
      (err) =>
        setState((s) => ({
          ...s,
          status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
          message: err.code === err.PERMISSION_DENIED ? "Location permission is off for Kori. You can turn it on in the browser's site settings." : "No GPS fix yet. Out in the open it usually takes under a minute.",
        })),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 60_000 },
    );
    return () => {
      window.clearTimeout(start);
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled]);
  return enabled ? state : { fix: null, status: "off", message: null };
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "25 min ago", "3 h ago", "Tue 6 Oct, 14:20". */
export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  const date = new Date(iso);
  return `${dayFormat.format(date)}, ${timeFormat.format(date)}`;
}

export function clockTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

let activePackCache: Promise<PackRecord | null> | null = null;

/**
 * The pack the map draws (a real park pack if one is chosen, else the sample reserve, else null),
 * shared by every component on the screen and reloaded whenever the store changes. Undefined until
 * it has loaded.
 */
export function useActivePack(): PackRecord | null | undefined {
  const [pack, setPack] = useState<PackRecord | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => {
      activePackCache ??= getStore().activePack();
      activePackCache.then((value) => alive && setPack(value)).catch(() => alive && setPack(null));
    };
    const reload = () => {
      activePackCache = null;
      load();
    };
    load();
    window.addEventListener(CHANGED_EVENT, reload);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED_EVENT, reload);
    };
  }, []);
  return pack;
}
