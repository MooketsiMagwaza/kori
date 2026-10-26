/* Kori field app service worker.
 *
 * Makes the app's own screens and files available with no signal:
 *   - On install it saves every screen listed in PAGES, plus the scripts and styles they reference,
 *     the MapLibre worker, the map's label fonts and the icons.
 *   - Screens are network-first (fresh when online, saved copy when not); hashed build files are
 *     cache-first (they never change under the same name).
 *   - Park packs and your sightings are NOT cached here: they live in the phone's storage (IndexedDB
 *     and the origin private file system), written by the app. Anything under /packs/ passes by.
 * It never caches cross-origin responses, non-GET requests, or anything with an Authorization header.
 * The skeleton (versioned caches, timeouts, offline fallback) follows the owner's earlier service
 * worker (see PROVENANCE.md).
 */

const VERSION = "kori-field-v2";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const OFFLINE_URL = "/offline.html";
const NETWORK_TIMEOUT_MS = 5000;
const PAGES = ["/", "/map", "/log", "/sightings", "/sighting", "/shared", "/scan", "/offline", "/trips", "/about"];
// The label fonts must match MAP_FONT_FILES in shared/map-style.ts.
const FONTS = ["400-normal", "400-italic", "600-normal"].flatMap((v) => [`/map-fonts/noto-sans-latin-${v}.woff2`, `/map-fonts/noto-sans-latin-ext-${v}.woff2`]);
const FILES = [OFFLINE_URL, "/icon.svg", "/manifest.webmanifest", "/maplibre/maplibre-gl-worker.mjs", "/maplibre/maplibre-gl-shared.mjs", "/icons/icon-192.png", ...FONTS];

async function precache() {
  const cache = await caches.open(SHELL);
  await Promise.all(FILES.map((url) => cache.add(url).catch(() => undefined)));
  const assets = new Set();
  for (const page of PAGES) {
    try {
      const response = await fetch(page, { cache: "no-store" });
      if (!response.ok) continue;
      const html = await response.clone().text();
      await cache.put(page, response);
      for (const match of html.matchAll(/["'(](\/_next\/static\/[^"'()\s]+)["')]/g)) assets.add(match[1]);
    } catch {
      /* offline during install: the next visit with a connection fills the cache */
    }
  }
  await Promise.all([...assets].map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok && response.type === "basic") await cache.put(fallbackKey ?? request, response.clone());
    return response;
  } catch (error) {
    const hit = (await cache.match(fallbackKey ?? request)) ?? (await caches.match(fallbackKey ?? request, { ignoreSearch: true }));
    if (hit) return hit;
    throw error;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") (await caches.open(SHELL)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("authorization")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/packs/")) return; // packs go to IndexedDB, never this cache

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, url.pathname).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/maplibre/") || url.pathname.startsWith("/map-fonts/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Everything else from this origin (for example the data for in-app navigation): fresh when
  // online, the last saved copy when not.
  event.respondWith(networkFirst(request, RUNTIME));
});
