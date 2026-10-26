// Copies the map's label fonts (Noto Sans, SIL Open Font License, from @fontsource/noto-sans) into
// public/map-fonts, so MapLibre can draw place and track names from them with no network. The list
// of files must equal MAP_FONT_FILES in shared/map-style.ts (tests/map.test.ts checks it). Runs before
// `dev` and `build`; the copies are not committed.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAP_FONT_FILES = ["400-normal", "400-italic", "600-normal"].flatMap((v) => [`noto-sans-latin-${v}.woff2`, `noto-sans-latin-ext-${v}.woff2`]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@fontsource", "noto-sans", "files");
const target = join(root, "public", "map-fonts");

if (!existsSync(source)) {
  console.error("@fontsource/noto-sans is not installed; run npm ci first.");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
for (const file of MAP_FONT_FILES) copyFileSync(join(source, file), join(target, file));
copyFileSync(join(root, "node_modules", "@fontsource", "noto-sans", "LICENSE"), join(target, "LICENSE-OFL.txt"));
console.log(`copied ${MAP_FONT_FILES.length} Noto Sans files to public/map-fonts`);
