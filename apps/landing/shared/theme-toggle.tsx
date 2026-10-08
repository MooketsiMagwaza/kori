"use client";

/**
 * Day and Night switch on the shared tokens (`[data-theme]` in tokens.css).
 *
 * `THEME_INIT_SCRIPT` runs inline in <head>, before hydration, so the right theme paints first:
 * the stored choice, else the system preference. `ThemeToggle` reads the theme from <html> through
 * useSyncExternalStore, flips `data-theme` and stores the choice. Single source in shared/; copied
 * into every app by scripts/sync-shared.mjs.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "kori-theme";

export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`;

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const snapshot = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  // The server always renders "light"; the browser reads the real value from <html>.
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light" as const);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode or storage blocked: the switch still works for this visit */
    }
  }

  const label = theme === "dark" ? "Switch to Day colours" : "Switch to Night colours";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={theme === "dark"} title={label}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === "dark" ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      {withLabel ? <span>{theme === "dark" ? "Night" : "Day"}</span> : <span className="sr-only">{label}</span>}
    </button>
  );
}
