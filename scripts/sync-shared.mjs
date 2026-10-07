// Copies shared/ into every app, or with --check fails if a copy has drifted.
//
//   node scripts/sync-shared.mjs          write the copies
//   node scripts/sync-shared.mjs --check  exit 1 when any copy differs from shared/ (CI runs this)
//
// Each app is deployed on its own (one Vercel project per app, each with its own root directory),
// so each needs its own copy of the tokens, icons and sample data. The copies are byte-identical on
// purpose, and the check keeps them from quietly diverging.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "shared");
const appsDir = join(root, "apps");
const apps = existsSync(appsDir) ? readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(source).map((path) => relative(source, path));
const check = process.argv.includes("--check");
const drifted = [];

for (const app of apps) {
  const target = join(appsDir, app, "shared");
  for (const file of files) {
    const from = readFileSync(join(source, file));
    const to = join(target, file);
    const current = existsSync(to) ? readFileSync(to) : null;
    if (current && current.equals(from)) continue;
    if (check) drifted.push(`apps/${app}/shared/${file.replaceAll("\\", "/")}`);
    else {
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, from);
      console.log(`wrote apps/${app}/shared/${file.replaceAll("\\", "/")}`);
    }
  }
  // Files removed from shared/ are removed from the copies too.
  if (existsSync(target)) {
    for (const path of walk(target)) {
      const file = relative(target, path);
      if (files.includes(file)) continue;
      if (check) drifted.push(`apps/${app}/shared/${file.replaceAll("\\", "/")} (not in shared/)`);
      else {
        rmSync(path);
        console.log(`removed apps/${app}/shared/${file.replaceAll("\\", "/")}`);
      }
    }
  }
}

if (check) {
  if (drifted.length) {
    console.error("These copies differ from shared/. Run `node scripts/sync-shared.mjs` and commit the result:");
    for (const path of drifted) console.error(`  - ${path}`);
    process.exit(1);
  }
  console.log(`shared/ is in sync across ${apps.length} app(s)`);
}
