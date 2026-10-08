"use client";

import { useEffect, useRef, useState } from "react";
import type { LonLat } from "@/shared/geo";
import { distanceMeters, formatDistance } from "@/shared/geo";
import { Icon } from "@/shared/icons";
import { getStore, type Trip } from "@/lib/store";
import { relativeTime, useGeolocation, useNow, useStoreData } from "@/lib/hooks";
import { toLine, tripLength, trimTrip, TRIM_METERS } from "@/lib/trips";

function TracePreview({ trip }: { trip: Trip }) {
  const { head, kept, tail } = trimTrip(trip.points);
  const all = toLine(trip.points);
  if (all.length < 2) return <p className="faint">Not enough points to draw yet.</p>;
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const [w, s, e, n] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const W = 400;
  const H = 250;
  const pad = 16;
  const scale = Math.min((W - pad * 2) / Math.max(e - w, 1e-6), (H - pad * 2) / Math.max(n - s, 1e-6));
  const pt = ([lon, lat]: LonLat) => `${(pad + (lon - w) * scale).toFixed(1)},${(H - pad - (lat - s) * scale).toFixed(1)}`;
  const poly = (line: LonLat[]) => line.map(pt).join(" ");
  return (
    <svg className="trace-preview" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Your trace, with the parts that would be removed before sharing shown faded">
      <polyline points={poly(toLine(head))} fill="none" stroke="var(--m-track-predicted)" strokeWidth="4" strokeDasharray="4 4" strokeLinecap="round" />
      <polyline points={poly(toLine(tail))} fill="none" stroke="var(--m-track-predicted)" strokeWidth="4" strokeDasharray="4 4" strokeLinecap="round" />
      <polyline points={poly(toLine(kept))} fill="none" stroke="var(--m-route)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TripsPage() {
  const now = useNow();
  const { data: trips } = useStoreData((store) => store.trips(), []);
  const active = trips?.find((t) => !t.endedAt) ?? null;
  const [asking, setAsking] = useState(false);
  const geo = useGeolocation(Boolean(active));
  const last = useRef<{ lon: number; lat: number; t: number } | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  // Store a point when the phone has moved 20 m or 15 seconds have passed.
  useEffect(() => {
    if (!active || !geo.fix) return;
    const fix = geo.fix;
    const prev = last.current;
    if (prev && distanceMeters([prev.lon, prev.lat], [fix.lon, fix.lat]) < 20 && fix.at - prev.t < 15_000) return;
    last.current = { lon: fix.lon, lat: fix.lat, t: fix.at };
    void getStore().addTripPoint(active.id, { t: fix.at, lon: fix.lon, lat: fix.lat, acc: Math.round(fix.accuracy) });
  }, [active, geo.fix]);

  // Keep the screen on while recording: a web app cannot record GPS reliably with the screen off.
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((lock) => (wake.current = lock)).catch(() => undefined);
    return () => {
      void wake.current?.release().catch(() => undefined);
      wake.current = null;
    };
  }, [active]);

  async function start() {
    setAsking(false);
    last.current = null;
    await getStore().startTrip();
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Trips</h1>
        <p className="muted">Recording a trip helps build the track map. It is off unless you switch it on, one trip at a time, and it stays on this phone.</p>
      </div>

      {active ? (
        <div className="card">
          <p className="recording">Recording this trip</p>
          <p>
            {active.points.length} points · {formatDistance(tripLength(active.points))} · started {now ? relativeTime(active.startedAt, now) : ""}
          </p>
          {geo.message ? <p className="notice notice-warn">{geo.message}</p> : null}
          <p className="faint">Keep Kori open with the screen on. A web app cannot record reliably in the background.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void getStore().endTrip(active.id)}>
            <Icon name="check" size={22} /> Stop recording
          </button>
        </div>
      ) : asking ? (
        <div className="card">
          <h2>Record this one trip?</h2>
          <ul className="muted" style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Your GPS position is saved on this phone every 20 m or so, until you stop.</li>
            <li>Nothing is sent while you drive. Sharing is a separate choice after the trip.</li>
            <li>If you share later, the first and last {TRIM_METERS / 1000} km are removed, times are rounded to the minute, no device ID is sent, and it is held back before use.</li>
            <li>Only tracks driven by 3 or more separate trips are ever published, never your trace.</li>
            <li>You can delete the trip at any time.</li>
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={start}>
              Yes, record this trip
            </button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={() => setAsking(true)}>
          <Icon name="tracks" size={22} /> Record a trip
        </button>
      )}

      <section aria-labelledby="past-h">
        <h2 id="past-h">Trips on this phone</h2>
        {!trips ? (
          <p className="empty">Loading…</p>
        ) : trips.filter((t) => t.endedAt).length === 0 ? (
          <p className="card empty">No finished trips yet.</p>
        ) : (
          trips
            .filter((t) => t.endedAt)
            .map((trip) => {
              const { kept } = trimTrip(trip.points);
              return (
                <div key={trip.id} className="card">
                  <div className="section-head">
                    <h3>{now ? relativeTime(trip.startedAt, now) : "Trip"}</h3>
                    <span className="faint">{formatDistance(tripLength(trip.points))}</span>
                  </div>
                  <TracePreview trip={trip} />
                  <p className="faint">
                    Blue is what could be shared; faded dashes are the first and last kilometre that would be removed.
                    {kept.length === 0 ? " This trip is too short: nothing would be shared." : ""}
                  </p>
                  <div className="btn-row">
                    <button type="button" className="btn" disabled aria-disabled="true" title="Needs the Kori service, not built yet">
                      <Icon name="share" size={20} /> Share to the track map (not available yet)
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => void getStore().deleteTrip(trip.id)}>
                      <Icon name="trash" size={20} /> Delete
                    </button>
                  </div>
                </div>
              );
            })
        )}
      </section>
    </div>
  );
}
