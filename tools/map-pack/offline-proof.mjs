// Proves a private park pack works offline in the field app, in headless Edge over the Chrome
// DevTools Protocol, and takes the screenshots. Node 24 (global WebSocket); no packages.
//
//   node offline-proof.mjs --base http://localhost:3105 --pack savuti --out <shots folder>
//        [--port 9334] [--edge <msedge.exe>] [--to s-003] [--at 24.066,-18.560]
//
// Run it against a production build served with KORI_LOCAL_PACKS_DIR pointing at the packs folder
// (outside the repository). What it does, in one fresh browser profile:
//   1. online: opens Offline and packs, downloads the pack into the browser's own storage, and
//      waits for the service worker to take control;
//   2. cuts the network (Network.emulateNetworkConditions offline, on the page and on the service
//      worker), then reloads the map and checks MapLibre drew the base map and the OSM tracks from
//      the stored pack; switches the satellite layer on; asks for a route along real tracks to a
//      sample sighting from an emulated GPS position inside the park; logs a sighting with that
//      position; taps a lone dot and checks its sighting opens;
//   3. takes Day and Night screenshots at 390 x 844 (2x) and 1440 x 900;
//   4. records every request the browser made, and fails if any went to a host other than the app.
// Writes proof.json beside the screenshots and prints a summary.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:3105");
const PACK = arg("pack", "savuti");
const OUT = arg("out", "shots");
const PORT = Number(arg("port", "9334"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const TO = arg("to", "s-003");
const [GPS_LON, GPS_LAT] = arg("at", "24.066,-18.560").split(",").map(Number);
const ORIGIN = new URL(BASE).origin;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { base: BASE, pack: PACK, started: new Date().toISOString(), steps: [], screenshots: [], console: [], requests: [] };
const step = (name, ok, detail = {}) => {
  report.steps.push({ name, ok, ...detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${Object.keys(detail).length ? " " + JSON.stringify(detail) : ""}`);
};

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("error", reject);
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) for (const l of this.listeners) l(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function launch() {
  const dir = mkdtempSync(join(tmpdir(), "kori-proof-"));
  const proc = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return { proc, dir, ws: (await res.json()).webSocketDebuggerUrl };
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("Edge did not start");
}

const { proc, dir, ws } = await launch();
const cdp = new Cdp(ws);
await cdp.ready;

// Every target's requests, page and service worker alike, with the phase they happened in.
let phase = "online";
const sessions = new Map(); // sessionId -> type
cdp.listeners.push(async (msg) => {
  if (msg.method === "Target.attachedToTarget") {
    const { sessionId, targetInfo } = msg.params;
    sessions.set(sessionId, targetInfo.type);
    if (targetInfo.type === "service_worker" || targetInfo.type === "worker") {
      await cdp.send("Network.enable", {}, sessionId).catch(() => undefined);
      if (phase === "offline") await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId).catch(() => undefined);
      await cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => undefined);
    }
  }
  if (msg.method === "Network.requestWillBeSent") {
    const url = msg.params.request.url;
    if (/^(data|blob|chrome|edge|devtools|about):/.test(url)) return;
    report.requests.push({ phase, target: sessions.get(msg.sessionId) ?? "page", url, id: msg.params.requestId });
  }
  if (msg.method === "Network.responseReceived") {
    const r = report.requests.find((x) => x.id === msg.params.requestId && x.url === msg.params.response.url);
    if (r) Object.assign(r, { status: msg.params.response.status, fromServiceWorker: msg.params.response.fromServiceWorker ?? false });
  }
  if (msg.method === "Network.loadingFailed") {
    const r = report.requests.find((x) => x.id === msg.params.requestId);
    if (r) r.failed = msg.params.errorText;
  }
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    report.console.push({ phase, type: msg.params.type, text: msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300) });
  }
  if (msg.method === "Runtime.exceptionThrown") report.console.push({ phase, type: "exception", text: msg.params.exceptionDetails.exception?.description?.slice(0, 300) ?? msg.params.exceptionDetails.text });
});

await cdp.send("Target.setDiscoverTargets", { discover: true });
await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId: page } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
sessions.set(page, "page");
for (const domain of ["Page", "Network", "Runtime"]) await cdp.send(`${domain}.enable`, {}, page);
await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, page);
await cdp.send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation"] });
await cdp.send("Emulation.setGeolocationOverride", { latitude: GPS_LAT, longitude: GPS_LON, accuracy: 10 }, page);
// Start in Day: headless Edge reports a dark system theme, which the app would follow.
await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, page);

const evaluate = async (expression) => {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, page);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expression, timeout = 30000, every = 300) => {
  const start = Date.now();
  for (;;) {
    try {
      const value = await evaluate(expression);
      if (value) return value;
    } catch {
      /* page still loading */
    }
    if (Date.now() - start > timeout) return null;
    await sleep(every);
  }
};
const go = async (path) => {
  await cdp.send("Page.navigate", { url: `${BASE}${path}` }, page);
  await waitFor("document.readyState === 'complete'", 30000);
};
const clickText = (selector, text) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);
const phone = () => cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, page);
const desktop = () => cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, page);
const setTheme = async (night) => {
  const isNight = await evaluate("document.documentElement.getAttribute('data-theme') === 'dark'");
  if (isNight !== night) await evaluate("document.querySelector('.theme-fab')?.click()");
  await sleep(400);
};
const mapIdle = () =>
  waitFor(
    `(() => { const m = window.koriMap; if (!m) return false; return m.loaded() && m.areTilesLoaded() && !!m.getSource('base'); })()`,
    30000,
  );
const shot = async (name) => {
  await sleep(700);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, page);
  const path = join(OUT, `${name}.png`);
  writeFileSync(path, Buffer.from(data, "base64"));
  report.screenshots.push(path);
  console.log(`     shot ${path}`);
};
const setSatellite = async (on) => {
  await evaluate(`document.querySelector('[aria-label="Layers and key"]')?.click()`);
  await sleep(300);
  await evaluate(`(() => { const box = [...document.querySelectorAll('.map-sheet input[type=checkbox]')].find((i) => i.parentElement.textContent.includes('Satellite imagery')); if (box && box.checked !== ${on}) box.click(); })()`);
  await sleep(200);
  await evaluate(`[...document.querySelectorAll('.map-sheet button')].find((b) => b.textContent.trim() === 'Close')?.click()`);
  await sleep(300);
  return waitFor(`(() => { const m = window.koriMap; return m && m.getLayer('imagery') && m.getLayoutProperty('imagery', 'visibility') === '${on ? "visible" : "none"}' && m.areTilesLoaded(); })()`, 20000);
};

mkdirSync(OUT, { recursive: true });
try {
  await phone();

  // 1. Online: download the pack into the browser's storage.
  await go("/offline");
  const offered = await waitFor(`[...document.querySelectorAll('.row-title')].some((e) => /Savuti/i.test(e.textContent))`, 20000);
  step("the computer serving the app offers the pack", Boolean(offered));
  const t0 = Date.now();
  await evaluate(`(() => { const li = [...document.querySelectorAll('li')].find((l) => /Savuti/i.test(l.querySelector('.row-title')?.textContent ?? '')); [...li.querySelectorAll('button')].find((b) => /Get/.test(b.textContent))?.click(); })()`);
  const stored = await waitFor(`[...document.querySelectorAll('li')].some((l) => /Savuti/i.test(l.textContent) && /On this phone/.test(l.textContent))`, 120000, 500);
  const where = await evaluate(`(async () => { try { const root = await navigator.storage.getDirectory(); const dir = await (await root.getDirectoryHandle('packs')).getDirectoryHandle(${JSON.stringify(PACK)}); const out = {}; for await (const [name, handle] of dir.entries()) out[name] = (await handle.getFile()).size; return { opfs: out }; } catch (e) { return { opfs: null, error: String(e) }; } })()`);
  const estimate = await evaluate("navigator.storage.estimate().then((e) => ({ usage: e.usage, quota: e.quota }))");
  step("the pack downloaded into the browser's own storage", Boolean(stored), { seconds: (Date.now() - t0) / 1000, files: where, storage: estimate });
  await shot("phone-packs-day");

  const controlled = await waitFor("navigator.serviceWorker && navigator.serviceWorker.controller !== null", 30000, 500);
  step("the service worker controls the page", Boolean(controlled));
  // Visit the screens once online, as a person would before driving out of signal.
  for (const path of ["/map", "/log", `/sighting?id=${TO}`, "/"]) await go(path);
  await sleep(1500);

  // 2. Offline.
  phase = "offline";
  for (const [id, type] of sessions) {
    if (type === "page" || type === "service_worker" || type === "worker") await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, id).catch(() => undefined);
  }
  const navigatorOffline = await evaluate("navigator.onLine === false");
  step("the network is cut (navigator.onLine is false)", navigatorOffline);

  await go("/map?debug");
  const drew = await mapIdle();
  const features = await evaluate(`(() => { const m = window.koriMap; if (!m) return null; const count = (layers) => m.queryRenderedFeatures({ layers: layers.filter((l) => m.getLayer(l)) }).length; return { tracks: count(['tracks-osm']), park: count(['base-park']), water: count(['base-water', 'base-river']), labels: count(['label-poi', 'label-place', 'label-water', 'label-river', 'label-road']), pins: document.querySelectorAll('.pin').length, clusters: document.querySelectorAll('.pin-cluster').length, credits: document.querySelector('.map-credits')?.textContent ?? null, chip: !!document.querySelector('.demo-chip'), themeButton: !!document.querySelector('.theme-fab') }; })()`);
  step("offline, the map draws the stored base map and OSM tracks", Boolean(drew && features?.tracks > 0 && features?.park > 0), features ?? {});
  step("the OpenStreetMap credit, the Demo data chip and the theme button are on screen", Boolean(features?.credits?.includes("OpenStreetMap contributors") && features.chip && features.themeButton), { credits: features?.credits });
  await shot("phone-map-day-offline");

  const sat = await setSatellite(true);
  const satCredit = await evaluate("document.querySelector('.map-credits')?.textContent ?? ''");
  step("offline, the satellite layer draws from the stored imagery", Boolean(sat), { credits: satCredit });
  step("the Copernicus credit shows while the imagery is on", satCredit.includes("Contains modified Copernicus Sentinel data 2025"));
  await shot("phone-satellite-day-offline");
  await evaluate("void window.koriMap.jumpTo({ center: [24.07, -18.565], zoom: 13.5 })");
  await mapIdle();
  await shot("phone-satellite-z13-day-offline");
  await evaluate("void window.koriMap.jumpTo({ center: [24.07, -18.565], zoom: 15 })");
  await mapIdle();
  await shot("phone-satellite-z15-day-offline");
  await setSatellite(false);
  await evaluate("void window.koriMap.jumpTo({ center: [24.07, -18.565], zoom: 13.5 })");
  await mapIdle();
  await shot("phone-map-z13-day-offline");

  // A route along real tracks, from the emulated GPS position inside the park.
  await go(`/map?debug&to=${TO}`);
  await mapIdle();
  await evaluate(`document.querySelector('[aria-label="Show my position"]')?.click()`);
  const routed = await waitFor(`(() => { const s = document.querySelector('.map-sheet')?.textContent ?? ''; return /along tracks/.test(s) ? s.slice(0, 400) : false; })()`, 30000);
  const routeInfo = await evaluate(`(() => { const m = window.koriMap; const f = m.querySourceFeatures('route'); const line = f[0]?.geometry?.coordinates ?? []; return { vertices: line.length, osmLabel: /OSM, not verified/.test(document.querySelector('.map-sheet')?.textContent ?? '') }; })()`);
  step("offline, a route runs along real OSM tracks from the GPS position", Boolean(routed && routeInfo.vertices > 1 && routeInfo.osmLabel), { sheet: routed, ...routeInfo });
  await sleep(800);
  await mapIdle();
  await shot("phone-route-day-offline");
  await setSatellite(true);
  await shot("phone-route-satellite-day-offline");

  // Log a sighting with the GPS position.
  const pinsBefore = await (async () => {
    await go("/map?debug");
    await mapIdle();
    return evaluate("document.querySelectorAll('.pin').length + [...document.querySelectorAll('.pin-cluster')].reduce((n, c) => n + Number(c.textContent), 0)");
  })();
  await go("/log");
  await waitFor("document.querySelectorAll('.species-btn').length > 0", 20000);
  await clickText(".species-btn", "African elephant");
  await clickText("button", "Use my GPS");
  await waitFor(`/Your GPS position/.test(document.body.textContent)`, 20000);
  await evaluate(`document.querySelector('button[type=submit]')?.click()`);
  const saved = await waitFor(`location.pathname === '/sighting' && /saved=1/.test(location.search) ? location.search : false`, 20000);
  await go("/map?debug");
  await mapIdle();
  const pinsAfter = await evaluate("document.querySelectorAll('.pin').length + [...document.querySelectorAll('.pin-cluster')].reduce((n, c) => n + Number(c.textContent), 0)");
  step("offline, a sighting is logged with the GPS position and appears on the map", Boolean(saved && pinsAfter === pinsBefore + 1), { saved, pinsBefore, pinsAfter });

  // One tap on a lone dot opens its sighting.
  await evaluate("void window.koriMap.jumpTo({ center: [24.09, -18.56], zoom: 12.5 })");
  await mapIdle();
  await sleep(500);
  const tapped = await evaluate(`(() => { const dot = document.querySelector('.pin'); if (!dot) return false; const r = dot.getBoundingClientRect(); const opts = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, isPrimary: true }; dot.dispatchEvent(new PointerEvent('pointerdown', opts)); dot.dispatchEvent(new PointerEvent('pointerup', opts)); dot.click(); return true; })()`);
  const opened = await waitFor("location.pathname === '/sighting' ? location.search : false", 15000);
  step("one tap on a lone dot opens its sighting", Boolean(tapped && opened), { opened });

  // 3. Screenshots, Night and desktop.
  await go("/map?debug");
  await mapIdle();
  await setTheme(true);
  await mapIdle();
  await shot("phone-map-night-offline");
  await setSatellite(true);
  await shot("phone-satellite-night-offline");
  await desktop();
  await go("/map?debug");
  await mapIdle();
  await setTheme(false);
  await mapIdle();
  await shot("desktop-map-day-offline");
  await setSatellite(true);
  await shot("desktop-satellite-day-offline");
  await setTheme(true);
  await mapIdle();
  await shot("desktop-satellite-night-offline");
  await setSatellite(false);
  await shot("desktop-map-night-offline");
  await go(`/map?debug&to=${TO}`);
  await mapIdle();
  await evaluate(`document.querySelector('[aria-label="Show my position"]')?.click()`);
  await waitFor(`/along tracks/.test(document.querySelector('.map-sheet')?.textContent ?? '')`, 20000);
  await sleep(800);
  await shot("desktop-route-night-offline");
  await setTheme(false);
  await shot("desktop-route-day-offline");
} catch (error) {
  step("the run finished without an error", false, { error: String(error) });
} finally {
  // 4. Where did requests go?
  const foreign = report.requests.filter((r) => new URL(r.url).origin !== ORIGIN);
  const offline = report.requests.filter((r) => r.phase === "offline");
  const offlineNetwork = offline.filter((r) => !r.fromServiceWorker && !r.failed && r.status);
  step("no request left the app's own origin", foreign.length === 0, { foreign: foreign.map((r) => r.url).slice(0, 20), total: report.requests.length });
  step("offline, nothing was served by the network", offlineNetwork.length === 0, {
    offlineRequests: offline.length,
    fromServiceWorker: offline.filter((r) => r.fromServiceWorker).length,
    failed: offline.filter((r) => r.failed).length,
    servedByNetwork: offlineNetwork.map((r) => r.url).slice(0, 10),
  });
  report.finished = new Date().toISOString();
  report.passed = report.steps.every((s) => s.ok);
  writeFileSync(join(OUT, "proof.json"), JSON.stringify(report, null, 1));
  console.log(report.passed ? "\nALL STEPS PASSED" : "\nSOME STEPS FAILED", `(${report.steps.filter((s) => s.ok).length}/${report.steps.length}); details in ${join(OUT, "proof.json")}`);
  await cdp.send("Browser.close").catch(() => undefined);
  proc.kill();
  await sleep(500);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Edge may still hold the profile for a moment */
  }
}
