"use client";

import Link from "next/link";
import { isPublic } from "@/shared/rules";
import { Icon } from "@/shared/icons";
import { SampleNote } from "@/components/bits";
import { SightingRow } from "@/components/sighting-row";
import { formatBytes, relativeTime, useNow, useOnline, useStoreData } from "@/lib/hooks";

export default function Home() {
  const now = useNow();
  const online = useOnline();
  const { data } = useStoreData(
    async (store) => {
      const at = new Date();
      const [sightings, outbox, pack, trips, lastSync] = await Promise.all([store.listSightings(at), store.outbox(), store.activePack(), store.trips(), store.lastSyncAttempt()]);
      return { sightings, outbox, pack, trips, lastSync };
    },
    [],
  );

  const recent = now && data ? data.sightings.filter((s) => s.source !== "sample" || isPublic(s, now)).slice(0, 5) : [];
  const recording = data?.trips.find((t) => !t.endedAt);

  return (
    <div className="page">
      <div className="hero-card">
        <p className="faint">Sample reserve (fictional) · prototype</p>
        <h1>What have you seen?</h1>
        <p className="muted">Log it now, even with no signal. It waits on this phone and goes to a reviewer when you are back in range.</p>
        <Link href="/log" className="btn btn-primary btn-block">
          <Icon name="plus" size={24} /> Log a sighting
        </Link>
        <div className="btn-row">
          <Link href="/map" className="btn">
            <Icon name="map" size={20} /> Open the map
          </Link>
          <Link href="/scan" className="btn">
            <Icon name="scan" size={20} /> Scan a code
          </Link>
        </div>
      </div>

      <section aria-labelledby="status-h">
        <h2 id="status-h">On this phone</h2>
        <div className="status-grid">
          <Link href="/offline" className="status-tile">
            <span className="tile-icon">
              <Icon name={online ? "wifi" : "offline"} />
            </span>
            <span>
              <strong>{online ? "Online" : "No signal"}</strong>
              <span className="muted">{online ? "Kori works the same when the signal drops." : "Everything you log is saved here. GPS still works."}</span>
            </span>
          </Link>
          <Link href="/offline" className="status-tile">
            <span className="tile-icon">
              <Icon name="sync" />
            </span>
            <span>
              <strong>{data ? (data.outbox.length ? `${data.outbox.length} waiting to send` : "Nothing waiting") : "Checking…"}</strong>
              <span className="muted">{data?.lastSync && now ? `Last tried ${relativeTime(data.lastSync, now)}.` : "No server is connected in the prototype yet."}</span>
            </span>
          </Link>
          <Link href="/offline" className="status-tile">
            <span className="tile-icon">
              <Icon name="download" />
            </span>
            <span>
              <strong>{data?.pack ? "Park pack ready" : "No park pack yet"}</strong>
              <span className="muted">{data?.pack ? `${data.pack.kind === "pmtiles" ? `${data.pack.name.split(",")[0]} (real map, private)` : "Sample reserve"}, ${formatBytes(data.pack.bytes)}. The map works offline.` : "Download the sample pack before you lose signal."}</span>
            </span>
          </Link>
          <Link href="/trips" className="status-tile">
            <span className="tile-icon">
              <Icon name="tracks" />
            </span>
            <span>
              <strong>{recording ? <span className="recording">Recording this trip</span> : "Trip recording is off"}</strong>
              <span className="muted">{recording ? `${recording.points.length} points, kept on this phone.` : "Off unless you switch it on, one trip at a time."}</span>
            </span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="recent-h">
        <div className="section-head">
          <h2 id="recent-h">Recent sightings</h2>
          <Link href="/sightings">All sightings</Link>
        </div>
        <SampleNote>Sample data. Other people&apos;s sightings appear here only after review and at least an hour after they were seen, as a 1 km area.</SampleNote>
        {now && data ? (
          <ul className="list">
            {recent.map((s) => (
              <SightingRow key={s.id} sighting={s} now={now} />
            ))}
          </ul>
        ) : (
          <p className="empty">Loading sightings…</p>
        )}
      </section>
    </div>
  );
}
