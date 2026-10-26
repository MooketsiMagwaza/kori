// Tests for the apps' chrome: where the Day and Night switch lives, and that the plain statement of what
// is sample data stays findable. They read the source files, because the pieces are React components
// and this repository tests without a browser. Node's built-in runner, no build step:
//   node --test tests/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Every place that renders the switch, and the bar it must not be in.
const SHELLS = [
  "apps/field/components/app-shell.tsx",
  "apps/landing/app/page.tsx",
  "apps/review/components/console-shell.tsx",
  "apps/api-docs/components/docs-shell.tsx",
];

/** The source between `<tag ...>` and `</tag>`, for every element of that tag in the text. */
function elements(source: string, tag: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<${tag}[\\s>]`, "g");
  for (let m = open.exec(source); m; m = open.exec(source)) {
    const end = source.indexOf(`</${tag}>`, m.index);
    if (end > m.index) out.push(source.slice(m.index, end));
  }
  return out;
}

test("the Day and Night switch is rendered once per app and never inside a bar", () => {
  for (const path of SHELLS) {
    const source = read(path);
    assert.ok(source.includes("<ThemeToggle"), `${path} renders the switch`);
    for (const tag of ["header", "aside", "nav"]) {
      for (const element of elements(source, tag)) {
        assert.ok(!element.includes("<ThemeToggle"), `${path}: the switch is inside a <${tag}>`);
      }
    }
  }
});

test("the switch is a floating round button with a constant name, aria-pressed, and no flash", () => {
  const component = read("shared/theme-toggle.tsx");
  assert.match(component, /aria-pressed=\{theme === "dark"\}/);
  assert.match(component, /aria-label="Night colours"/);
  assert.match(component, /THEME_INIT_SCRIPT/);
  const css = read("shared/chrome.css");
  const fab = css.slice(css.indexOf(".theme-fab {"), css.indexOf("}", css.indexOf(".theme-fab {")));
  assert.match(fab, /position: fixed/);
  assert.match(fab, /width: var\(--tap\)/, "48px, above the 44px minimum");
  assert.match(fab, /env\(safe-area-inset-bottom\)/);
  assert.match(fab, /var\(--c-glass\)/);
  assert.match(css, /theme-fab-moon[\s\S]*display: none/, "the icon is chosen by CSS, so it is right on first paint");
});

test("the field app puts the switch at the bottom left, above the dock", () => {
  const css = read("apps/field/app/globals.css");
  const rule = css.slice(css.indexOf(".theme-fab {"), css.indexOf("}", css.indexOf(".theme-fab {")));
  assert.match(rule, /right: auto/);
  assert.match(rule, /left: var\(--fab-left\)/);
  assert.match(rule, /bottom: var\(--fab-bottom\)/);
  assert.match(css, /--fab-bottom: calc\(var\(--dock-space\) - var\(--s-3\)\)/);
});

test("the map keeps one slim chip, a button the screenshot tool can find, and the safety warning", () => {
  const map = read("apps/field/components/park-map.tsx");
  assert.ok(map.includes("Download the sample pack"), "the visible text of the download button");
  assert.ok(map.includes('className="map-chip"'));
  assert.ok(!map.includes("No park pack on this phone"), "the big card is gone");
  assert.ok(!map.includes("Generated tracks that do not match the ground"), "the second notice is gone");
  assert.ok(map.includes("Do not navigate by it"), "the warning is in the (i) panel");
  assert.ok(map.includes("Pack {formatBytes("), "the pack size is in the attribution row");
  assert.ok(map.includes("<DemoDataChip />"));
  assert.ok(read("apps/field/app/offline/page.tsx").includes("Do not navigate by it"), "the warning is on the Offline and packs page");
});

test("the landing hero has no sample-data banner, and the demo-data statement is on the status section", () => {
  const landing = read("apps/landing/app/page.tsx");
  assert.ok(!landing.includes("A working prototype with sample data"));
  assert.ok(!landing.includes('className="sample-note"'));
  assert.ok(landing.includes('href="#demo-data"'), "the footer chip links to the statement");
  const statement = landing.slice(landing.indexOf('id="demo-data"'));
  assert.ok(statement.includes("About the demo data"));
  assert.match(statement, /fictional/);
  assert.match(statement, /not deployed and the apps do not call it yet/);
  assert.match(statement, /must not be used to navigate/);
});

test("the field app's About page states plainly what the demo data is", () => {
  const about = read("apps/field/app/about/page.tsx");
  const statement = about.slice(about.indexOf('id="demo-data"'), about.indexOf("Animals come first"));
  assert.ok(statement.includes("About the demo data"));
  for (const word of ["reserve", "sightings", "observers", "reviews", "invented", "fictional", "do not match the ground", "Do not navigate by it", "not deployed and the apps do not call it yet"]) {
    assert.ok(statement.includes(word), `the statement says "${word}"`);
  }
  // Sighting pages carry the chip that links to it.
  assert.ok(read("apps/field/app/sighting/page.tsx").includes("<DemoDataChip />"));
  assert.ok(read("apps/field/components/bits.tsx").includes('href="/about#demo-data"'));
});
