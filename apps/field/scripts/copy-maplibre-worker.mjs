// Copies MapLibre's web worker into public/maplibre so the browser can load it, online or offline.
//
// MapLibre 6 finds its worker relative to its own module URL. After Next bundles the library that
// URL points at a hashed chunk and 404s, so GeoJSON layers silently never draw. Serving the files
// ourselves and calling setWorkerUrl() (lib/maplibre-setup.ts) removes the guesswork, and lets the
// service worker cache them for use with no signal. Runs before `dev` and `build`.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "maplibre-gl", "dist");
const target = join(root, "public", "maplibre");
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

if (!existsSync(source)) {
  console.error("maplibre-gl is not installed; run npm ci first.");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
for (const file of files) copyFileSync(join(source, file), join(target, file));
console.log(`copied ${files.join(" and ")} to public/maplibre`);
