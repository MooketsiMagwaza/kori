// Name gate: fails when a tracked file carries a name from the code Kori was started from, or from
// the owner's other products. PROVENANCE.md is the one file allowed to name the source, because its
// job is to say where code came from.
//
//   node scripts/check-names.mjs
//
// The banned words are assembled from parts so this file does not trip its own check.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Prefix matches catch compound names (for example a component called <Name>Icon). The minibus word
// is matched whole, so ordinary words such as "combined" pass.
const prefixes = [["ts", "ela"], ["stock", "link"], ["transit", "os"], ["gt", "fs"]].map((parts) => parts.join(""));
const whole = [["com", "bis?"]].map((parts) => parts.join(""));
const allowed = new Set(["PROVENANCE.md"]);
const pattern = new RegExp(`\\b(${prefixes.join("|")})|\\b(${whole.join("|")})\\b`, "i");

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const hits = [];

for (const file of files) {
  if (allowed.has(file) || /\.(png|jpe?g|webp|ico|woff2?|pmtiles|mbtiles)$/i.test(file)) continue;
  if (file.endsWith("package-lock.json")) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  text.split(/\r?\n/).forEach((line, index) => {
    if (pattern.test(line)) hits.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
  });
  if (pattern.test(file)) hits.push(`${file}: the path itself`);
}

if (hits.length) {
  console.error("Names that must not appear in Kori were found:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`name gate passed over ${files.length} tracked files`);
