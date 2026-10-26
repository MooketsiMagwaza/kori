"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SAMPLE_RESERVE_ID } from "@/shared/reserve";
import { Icon } from "@/shared/icons";
import { getStore, type PackProgress, type RealPackRecord, type SyncResult } from "@/lib/store";
import { formatBytes, relativeTime, useNow, useOnline, useStoreData } from "@/lib/hooks";

type StorageInfo = { usage: number; quota: number; persisted: boolean } | null;

function useStorageInfo(tick: number): StorageInfo {
  const [info, setInfo] = useState<StorageInfo>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!navigator.storage?.estimate) return;
      const estimate = await navigator.storage.estimate();
      const persisted = (await navigator.storage.persisted?.()) ?? false;
      if (alive) setInfo({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tick]);
  return info;
}

function useServiceWorkerReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      const t = window.setTimeout(() => setReady(false), 0);
      return () => window.clearTimeout(t);
    }
    let alive = true;
    navigator.serviceWorker.getRegistration().then((reg) => alive && setReady(Boolean(reg?.active)));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

export default function OfflinePage() {
  const online = useOnline();
  const now = useNow();
  const [tick, setTick] = useState(0);
  const storage = useStorageInfo(tick);
  const swReady = useServiceWorkerReady();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const { data } = useStoreData(async (store) => {
    const [outbox, pack, lastSync, packs, active, offered] = await Promise.all([
      store.outbox(),
      store.getPack(SAMPLE_RESERVE_ID),
      store.lastSyncAttempt(),
      store.packs(),
      store.activePack(),
      store.localPacks(),
    ]);
    const real = packs.filter((p): p is RealPackRecord => p.kind === "pmtiles");
    return { outbox, pack: pack ?? null, lastSync, real, activeId: active?.id ?? null, offered };
  }, []);

  // Real packs: those on this phone, and those the computer serving the app offers.
  const realRows = (() => {
    if (!data) return [];
    const rows = new Map<string, { id: string; name: string; bytes: number; stored: RealPackRecord | null }>();
    for (const p of data.offered) rows.set(p.id, { id: p.id, name: p.name, bytes: p.totalBytes, stored: null });
    for (const p of data.real) rows.set(p.id, { id: p.id, name: p.name, bytes: p.bytes, stored: p });
    return [...rows.values()];
  })();

  async function downloadReal(id: string) {
    setBusy(true);
    setPackError(null);
    try {
      await getStore().downloadRealPack(id, setProgress);
      setTick((t) => t + 1);
    } catch (reason) {
      setPackError(reason instanceof Error ? reason.message : "The pack could not be downloaded.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function removeReal(id: string) {
    setBusy(true);
    await getStore().deletePack(id);
    setTick((t) => t + 1);
    setBusy(false);
  }

  async function sync() {
    setSyncing(true);
    setResult(await getStore().sync());
    setSyncing(false);
  }

  async function downloadPack() {
    setBusy(true);
    setPackError(null);
    try {
      await getStore().downloadPack(SAMPLE_RESERVE_ID, "/packs/sample-reserve");
      setTick((t) => t + 1);
    } catch (reason) {
      setPackError(reason instanceof Error ? reason.message : "The pack could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  async function removePack() {
    setBusy(true);
    await getStore().deletePack(SAMPLE_RESERVE_ID);
    setTick((t) => t + 1);
    setBusy(false);
  }

  async function keepData() {
    await navigator.storage?.persist?.();
    setTick((t) => t + 1);
  }

  const used = storage && storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Offline and packs</h1>
        <p className="muted">What this phone can do with no signal, and what is waiting to send.</p>
      </div>

      <p className={`notice ${online ? "notice-good" : "notice-warn"}`} role="status">
        <Icon name={online ? "wifi" : "offline"} size={20} />
        <span>
          <strong>{online ? "Online now." : "No signal."}</strong>{" "}
          {online ? "When the signal drops, Kori keeps working from what is stored here." : "Sightings you log are saved on this phone. The map draws from your downloaded pack, and GPS still works."}
        </span>
      </p>

      <section aria-labelledby="send-h">
        <h2 id="send-h">Waiting to send</h2>
        <div className="card">
          <p>
            <strong style={{ fontSize: "var(--fs-lg)" }}>{data ? data.outbox.length : "…"}</strong> sighting{data?.outbox.length === 1 ? "" : "s"} saved on this phone and not yet sent.
          </p>
          <p className="faint">
            {data?.lastSync && now ? `Last tried ${relativeTime(data.lastSync, now)}. ` : ""}Each one carries its own key, so sending twice can never create a duplicate.
          </p>
          <button type="button" className="btn" onClick={sync} disabled={syncing} style={{ alignSelf: "flex-start" }}>
            <Icon name="sync" size={20} /> {syncing ? "Trying…" : "Send now"}
          </button>
          {result ? <p className={`notice ${result.configured ? "notice-plain" : "notice-warn"}`}>{result.message}</p> : null}
        </div>
      </section>

      <section aria-labelledby="packs-h">
        <h2 id="packs-h">Park packs</h2>
        <p className="muted">Download a park before you lose signal. The map draws only from packs on this phone.</p>
        <ul className="list">
          <li>
            <div className="row">
              <span className="tile-icon" style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: 10, background: "var(--c-fill)" }}>
                <Icon name="map" />
              </span>
              <span className="row-main">
                <span className="row-title">Sample reserve</span>
                <span className="row-sub">Fictional · vector only · tracks, pans, gate and camps</span>
                <span className="row-sub">
                  {data?.pack ? `On this phone · ${formatBytes(data.pack.bytes)} · version ${data.pack.version}` : "Not downloaded"}
                </span>
              </span>
              {data?.pack ? (
                <button type="button" className="btn btn-danger" onClick={removePack} disabled={busy} aria-label="Delete the sample reserve pack">
                  <Icon name="trash" size={20} />
                </button>
              ) : (
                <button type="button" className="btn" onClick={downloadPack} disabled={busy || !online}>
                  <Icon name="download" size={20} /> {busy ? "…" : "Get"}
                </button>
              )}
            </div>
            {data?.pack && data.real.some((p) => p.complete) ? (
              <label className="check" style={{ paddingInline: "var(--s-4)" }}>
                <input type="radio" name="active-pack" checked={data.activeId === SAMPLE_RESERVE_ID} onChange={() => getStore().setActivePack(null)} />
                <span>Show on the map</span>
              </label>
            ) : null}
          </li>
          {realRows.map((row) => {
            const stored = row.stored;
            const loading = progress !== null && busy;
            return (
              <li key={row.id}>
                <div className="row">
                  <span style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: 10, background: "var(--c-fill)" }}>
                    <Icon name="map" />
                  </span>
                  <span className="row-main">
                    <span className="row-title">{row.name}</span>
                    <span className="row-sub">Real map · private · OpenStreetMap tracks (OSM, not verified) · Sentinel-2 imagery</span>
                    <span className="row-sub">
                      {stored?.complete
                        ? `On this phone · ${formatBytes(stored.bytes)} · version ${stored.version}`
                        : stored
                          ? "Download did not finish. Get it again, or delete it."
                          : loading
                            ? `Downloading ${progress.file} · ${formatBytes(progress.overall)} of ${formatBytes(progress.overallTotal)}`
                            : `Offered by this computer · ${formatBytes(row.bytes)}`}
                    </span>
                  </span>
                  {stored ? (
                    <button type="button" className="btn btn-danger" onClick={() => removeReal(row.id)} disabled={busy} aria-label={`Delete the ${row.name} pack`}>
                      <Icon name="trash" size={20} />
                    </button>
                  ) : null}
                  {!stored?.complete ? (
                    <button type="button" className="btn" onClick={() => downloadReal(row.id)} disabled={busy || !online}>
                      <Icon name="download" size={20} /> {loading ? `${Math.floor((progress.overall / Math.max(1, progress.overallTotal)) * 100)}%` : "Get"}
                    </button>
                  ) : null}
                </div>
                {loading ? (
                  <div className="meter" aria-hidden="true" style={{ marginInline: "var(--s-4)" }}>
                    <span style={{ width: `${Math.max(1, (progress.overall / Math.max(1, progress.overallTotal)) * 100)}%` }} />
                  </div>
                ) : null}
                {stored?.complete ? (
                  <label className="check" style={{ paddingInline: "var(--s-4)" }}>
                    <input type="radio" name="active-pack" checked={data?.activeId === row.id} onChange={() => getStore().setActivePack(row.id)} />
                    <span>Show on the map</span>
                  </label>
                ) : null}
              </li>
            );
          })}
          {realRows.length === 0 ? (
            <li>
              <div className="row">
                <span style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: 10, background: "var(--c-fill)" }}>
                  <Icon name="lock" />
                </span>
                <span className="row-main">
                  <span className="row-title">Real parks</span>
                  <span className="row-sub">Not available. Kori will cover a park only after asking the Department of Wildlife and National Parks.</span>
                </span>
              </div>
            </li>
          ) : null}
        </ul>
        {realRows.length ? (
          <p className="notice notice-plain">
            <Icon name="lock" size={20} />
            <span>
              <strong>Real parks are private for now.</strong> This pack comes from the computer serving Kori and stays on your own phone. Kori will cover a park publicly only after asking
              the Department of Wildlife and National Parks. Map data © OpenStreetMap contributors (ODbL); contains modified Copernicus Sentinel data 2025.
            </span>
          </p>
        ) : null}
        <p className="notice notice-warn">
          <Icon name="alert" size={20} />
          <span>
            <strong>The sample reserve is fictional.</strong> Its tracks do not match the ground. Do not navigate by it.{" "}
            <Link href="/about#demo-data">About the demo data</Link>
          </span>
        </p>
        {packError ? <p className="notice notice-bad">{packError}</p> : null}
        {data?.pack ? (
          <Link href="/map" className="btn" style={{ alignSelf: "flex-start" }}>
            <Icon name="map" size={20} /> Open the map
          </Link>
        ) : null}
      </section>

      <section aria-labelledby="storage-h">
        <h2 id="storage-h">Storage on this phone</h2>
        <div className="card">
          {storage ? (
            <>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${Math.max(1, used)}%` }} />
              </div>
              <p>
                Kori is using {formatBytes(storage.usage)} of about {formatBytes(storage.quota)} the browser allows.
              </p>
              <p className="faint">
                {storage.persisted
                  ? "This browser has agreed to keep Kori's data unless you clear it."
                  : "The browser may clear Kori's data when space runs low. Ask it to keep the data, and on iPhone add Kori to your home screen."}
              </p>
              {!storage.persisted ? (
                <button type="button" className="btn" onClick={keepData} style={{ alignSelf: "flex-start" }}>
                  <Icon name="shield" size={20} /> Keep Kori&apos;s data
                </button>
              ) : null}
            </>
          ) : (
            <p className="faint">This browser does not report storage use.</p>
          )}
          <p className="faint">
            App available offline:{" "}
            {swReady === null ? "checking…" : swReady ? "yes, the app's screens are saved on this phone." : "not yet. Open Kori once with a connection (in the deployed build) and it saves itself."}
          </p>
        </div>
      </section>

      <section aria-labelledby="more-h">
        <h2 id="more-h">More</h2>
        <ul className="list">
          <li>
            <Link className="row" href="/trips">
              <Icon name="tracks" />
              <span className="row-main">
                <span className="row-title">Trips</span>
                <span className="row-sub">Record a trip, opt-in, kept on this phone</span>
              </span>
              <Icon name="chevronRight" />
            </Link>
          </li>
          <li>
            <Link className="row" href="/scan">
              <Icon name="scan" />
              <span className="row-main">
                <span className="row-title">Scan a code</span>
                <span className="row-sub">Receive a sighting from another phone</span>
              </span>
              <Icon name="chevronRight" />
            </Link>
          </li>
          <li>
            <Link className="row" href="/about">
              <Icon name="shield" />
              <span className="row-main">
                <span className="row-title">Safety, privacy and sample data</span>
                <span className="row-sub">The rules Kori follows</span>
              </span>
              <Icon name="chevronRight" />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
