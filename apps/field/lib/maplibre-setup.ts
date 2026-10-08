/** Points MapLibre at the worker served from /maplibre; import this before creating any map. */

import { setWorkerUrl } from "maplibre-gl";

// Copied into public/maplibre by scripts/copy-maplibre-worker.mjs, and cached by the service worker
// so maps draw with no signal.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
