// Measures WCAG 2.2 contrast for the pairs the apps actually draw, from shared/tokens.css, and fails
// when one is below its threshold. Translucent colours are composited the way the browser would:
// a glass or card surface over the canvas washes (or over the map colours), then text over that.
//
//   node scripts/check-contrast.mjs           print every pair and exit 1 on a failure
//   node scripts/check-contrast.mjs --json    print the measurements as JSON
//
// Thresholds: 4.5 for text, 3 for graphics and component edges (WCAG 1.4.3 and 1.4.11). The
// figures quoted in the header of shared/tokens.css come from this script.
//
// It also checks that the `theme-color` values in each app's layout, and the web manifest, equal
// the canvas colours in the tokens, because those cannot read a CSS variable.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "shared", "tokens.css"), "utf8");

/* ---------- parse the custom properties of each theme ---------- */

function blocks(text, depth = 0, prefix = "") {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const head = text.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let level = 1;
    let j = open + 1;
    while (j < text.length && level) {
      if (text[j] === "{") level += 1;
      else if (text[j] === "}") level -= 1;
      j += 1;
    }
    const body = text.slice(open + 1, j - 1);
    if (head.startsWith("@")) out.push(...blocks(body, depth + 1, `${prefix}${head} > `));
    else out.push({ selector: `${prefix}${head}`, body });
    i = j;
  }
  return out;
}

function declarations(body) {
  const map = {};
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[match[1]] = match[2].replace(/\s+/g, " ").trim();
  return map;
}

const all = blocks(css);
const find = (selector) => all.filter((b) => b.selector === selector).map((b) => declarations(b.body));
const day = Object.assign({}, ...find(":root"));
const night = Object.assign({}, day, ...find('[data-theme="dark"]'));
const dayNoBlur = Object.assign({}, day, ...find("@media (prefers-reduced-transparency: reduce) > :root"));
const nightNoBlur = Object.assign({}, night, ...find('@media (prefers-reduced-transparency: reduce) > [data-theme="dark"]'));

/* ---------- colour maths ---------- */

function parse(value) {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`cannot parse colour "${value}"`);
}

/** Source-over: `top` painted on `bottom`. */
function over(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

function luminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/* ---------- the canvas: every colour the washes can put behind content ---------- */

function canvasSamples(theme) {
  const base = parse(theme["--c-bg"]);
  const wash = theme["--wash"];
  const linear = wash.slice(wash.lastIndexOf("linear-gradient"));
  const ends = [...linear.matchAll(/(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))\s+\d+%/gi)].map((m) => parse(m[1]));
  const peaks = [];
  for (const radial of wash.split("radial-gradient").slice(1)) {
    const first = radial.match(/(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))\s+0%/i);
    if (first) peaks.push(parse(first[1]));
  }
  const samples = [{ name: "canvas", c: base }];
  ends.forEach((c, i) => samples.push({ name: `canvas base ${i ? "bottom" : "top"}`, c }));
  peaks.forEach((p, i) => ends.forEach((e, j) => samples.push({ name: `wash ${i ? "mint/green" : "blue"} over base ${j ? "bottom" : "top"}`, c: over(p, e) })));
  return samples;
}

/* ---------- the pairs ---------- */

const results = [];
let failed = 0;

function record(theme, label, fg, bgName, bg, min, kind) {
  const value = ratio(fg, bg);
  const pass = value >= min;
  if (!pass) failed += 1;
  results.push({ theme, label, on: bgName, ratio: Math.round(value * 100) / 100, min, kind, pass, fg: hex(fg), bg: hex(bg) });
}

/** The worst (lowest) ratio of `fg` over every background in `backgrounds`. */
function worst(theme, label, fg, backgrounds, min, kind = "text") {
  let low = null;
  for (const bg of backgrounds) {
    const value = ratio(fg.a < 1 ? over(fg, bg.c) : fg, bg.c);
    if (!low || value < low.value) low = { value, bg };
  }
  record(theme, label, fg.a < 1 ? over(fg, low.bg.c) : fg, low.bg.name, low.bg.c, min, kind);
}

function check(name, t, noBlur) {
  const c = (key) => parse(t[key]);
  const canvas = canvasSamples(t);
  const onSurface = canvas.map((s) => ({ name: `card on ${s.name}`, c: over(c("--c-surface"), s.c) }));
  const solid = [{ name: "solid surface", c: c("--c-surface-solid") }];
  const glassOverCanvas = canvas.map((s) => ({ name: `glass on ${s.name}`, c: over(c("--c-glass"), s.c) }));
  // A panel floats over areas of the map (outside the reserve, inside it, water), blurred. Thin lines
  // such as tracks cannot be the backdrop of a whole panel, so they are checked as graphics below.
  const mapSurfaces = ["--m-land", "--m-land-2", "--m-pan"].map((k) => ({ name: `map ${k.slice(4)}`, c: parse(t[k]) }));
  const glassOverMap = mapSurfaces.map((s) => ({ name: `glass on ${s.name}`, c: over(c("--c-glass"), s.c) }));
  const everywhere = [...canvas, ...onSurface, ...solid];
  const floating = [...glassOverCanvas, ...glassOverMap, ...solid];
  const tag = noBlur ? `${name} (reduced transparency)` : name;

  for (const key of ["--c-ink", "--c-ink-2", "--c-ink-3"]) {
    worst(tag, `${key.slice(2)} text`, c(key), everywhere, 4.5);
    worst(tag, `${key.slice(2)} text on glass`, c(key), floating, 4.5);
  }
  worst(tag, "on-accent text on the action fill", c("--c-on-accent"), [{ name: "action fill", c: c("--c-accent") }, { name: "action fill, hover", c: c("--c-accent-hover") }], 4.5);
  worst(tag, "link text", c("--c-accent-text"), [...everywhere, ...glassOverCanvas], 4.5);
  const selected = [...canvas, ...onSurface].map((s) => ({ name: `selected on ${s.name}`, c: over(c("--c-accent-soft"), s.c) }));
  worst(tag, "link text on the selected fill", c("--c-accent-text"), selected, 4.5);
  worst(tag, "ink on the selected fill", c("--c-ink"), selected, 4.5);
  // Chips and buttons that sit on the glass over the map: the "No park pack" button, the "Demo data" chip
  // and the "Pack 18 KB" row at the bottom of the map, and the Day and Night button in its hover state.
  worst(tag, "link text on glass", c("--c-accent-text"), floating, 4.5);
  const selectedGlass = floating.map((s) => ({ name: `selected fill on ${s.name}`, c: over(c("--c-accent-soft"), s.c) }));
  worst(tag, "link text on the selected fill, over glass", c("--c-accent-text"), selectedGlass, 4.5);
  const fillGlass = floating.map((s) => ({ name: `chip on ${s.name}`, c: over(c("--c-fill"), s.c) }));
  worst(tag, "secondary ink on a neutral chip, over glass", c("--c-ink-2"), fillGlass, 4.5);
  worst(tag, "focus ring (3:1 graphic)", c("--c-focus"), [...everywhere, ...floating], 3, "graphic");
  worst(tag, "input and button edge (3:1 graphic)", c("--c-line-strong"), [...everywhere, ...floating], 3, "graphic");
  const fill = [...canvas, ...onSurface].map((s) => ({ name: `chip on ${s.name}`, c: over(c("--c-fill"), s.c) }));
  worst(tag, "secondary ink on a neutral chip", c("--c-ink-2"), fill, 4.5);

  for (const [state, text, soft] of [
    ["approved and online", "--c-good", "--c-good-soft"],
    ["waiting and offline", "--c-warn", "--c-warn-soft"],
    ["rejected and sensitive", "--c-bad", "--c-bad-soft"],
    ["sample data note", "--c-brand-ink", "--c-brand-soft"],
  ]) {
    const softOn = [...canvas, ...onSurface].map((s) => ({ name: `${soft.slice(4)} on ${s.name}`, c: over(c(soft), s.c) }));
    worst(tag, `${state}: text on its soft fill`, c(text), softOn, 4.5);
  }
  worst(tag, "status text on the canvas and cards", c("--c-bad"), everywhere, 4.5);
  worst(tag, "approved text on the canvas and cards", c("--c-good"), everywhere, 4.5);
  worst(tag, "waiting text on the canvas and cards", c("--c-warn"), everywhere, 4.5);
  worst(tag, "brand green (mark, 3:1 graphic)", c("--c-brand"), [...everywhere, ...floating], 3, "graphic");

  worst(tag, "code sample text", c("--c-on-code"), [{ name: "code block", c: c("--c-code") }], 7);
  worst(tag, "QR code on its paper", c("--qr-ink"), [{ name: "QR paper", c: c("--qr-paper") }], 7);

  // The map: lines and areas against the ground they cross (3:1), pins against their halo.
  const ground = ["--m-land", "--m-land-2", "--m-pan"].map((k) => ({ name: `map ${k.slice(4)}`, c: c(k) }));
  for (const [label, key] of [
    ["verified track", "--m-track"],
    ["GPS track", "--m-track-gps"],
    ["predicted track", "--m-track-predicted"],
    ["reserve boundary", "--m-boundary"],
    ["sighting area edge", "--m-cell"],
    ["sensitive area edge", "--m-cell-sensitive"],
    ["route line", "--m-route"],
    ["your position", "--m-me"],
  ]) {
    worst(tag, `map: ${label} (3:1 graphic)`, c(key), ground, 3, "graphic");
  }
  worst(tag, "map: sighting dot against its halo (3:1 graphic)", c("--m-cell"), [{ name: "halo", c: c("--m-halo") }], 3, "graphic");
  worst(tag, "map: sensitive dot against its halo (3:1 graphic)", c("--m-cell-sensitive"), [{ name: "halo", c: c("--m-halo") }], 3, "graphic");
  worst(tag, "map: route line against its casing (3:1 graphic)", c("--m-route"), [{ name: "casing", c: c("--m-halo") }], 3, "graphic");
}

check("Day", day, false);
check("Night", night, false);
check("Day", dayNoBlur, true);
check("Night", nightNoBlur, true);

/* ---------- theme-color and manifest colours must equal the canvas ---------- */

const metaFiles = [];
const appsDir = join(root, "apps");
if (existsSync(appsDir)) {
  for (const app of readdirSync(appsDir)) {
    for (const file of ["app/layout.tsx", "app/manifest.ts"]) {
      const path = join(appsDir, app, file);
      if (existsSync(path)) metaFiles.push(path);
    }
  }
}
const expected = { light: day["--c-bg"].toLowerCase(), dark: night["--c-bg"].toLowerCase() };
const drift = [];
for (const path of metaFiles) {
  const text = readFileSync(path, "utf8");
  for (const m of text.matchAll(/prefers-color-scheme: (light|dark)\)",\s*color:\s*"(#[0-9a-f]{6})"/gi)) {
    if (m[2].toLowerCase() !== expected[m[1]]) drift.push(`${path.replace(root, "").replaceAll("\\", "/")}: ${m[1]} theme-color ${m[2]} should be ${expected[m[1]]}`);
  }
  for (const m of text.matchAll(/(background_color|theme_color):\s*"(#[0-9a-f]{6})"/gi)) {
    if (m[2].toLowerCase() !== expected.light) drift.push(`${path.replace(root, "").replaceAll("\\", "/")}: ${m[1]} ${m[2]} should be ${expected.light}`);
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ results, drift }, null, 2));
} else {
  const width = Math.max(...results.map((r) => r.label.length));
  let current = "";
  for (const r of results) {
    if (r.theme !== current) {
      current = r.theme;
      console.log(`\n${current}`);
    }
    console.log(`  ${r.pass ? "ok  " : "FAIL"} ${r.label.padEnd(width)}  ${r.ratio.toFixed(2).padStart(5)}:1  (min ${r.min})  worst on ${r.on}  ${r.fg} on ${r.bg}`);
  }
  for (const line of drift) console.log(`\nDRIFT ${line}`);
  console.log(`\n${results.length - failed} of ${results.length} pairs pass${drift.length ? `, ${drift.length} theme-color value(s) differ from the tokens` : ""}.`);
}
if (failed || drift.length) process.exit(1);
