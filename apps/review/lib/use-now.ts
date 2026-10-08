"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every minute. Undefined until mounted, so server and client agree. */
export function useNow(everyMs = 60_000): Date | undefined {
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

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function when(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${day.format(new Date(iso))}, ${clock.format(new Date(iso))}`;
}

export function clockTime(iso: string): string {
  return clock.format(new Date(iso));
}
