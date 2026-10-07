/**
 * Kori's mark and its small icon set. Drawn for Kori; shared by every app through
 * scripts/sync-shared.mjs.
 *
 * The mark is a kori bustard in profile: heavy body, upright neck, swept-back crest and long legs.
 * Icons are 24px outlines on a 2px stroke, used only where they help people scan.
 */

import type { SVGProps } from "react";

/** The kori bustard. `currentColor` fills the bird, so it follows the surrounding text colour. */
export function KoriMark({ size = 32, title, ...props }: { size?: number; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M6 37.5c3.2-6.6 10.6-12.2 21.4-13.4 4.4-.5 8.2 0 10.9 1 .8-3.7 1.4-7.8 2.6-11.2l-5.4-3.4 6.7.4c1.3-2.3 3.4-3.4 6-3.1 1.8.2 3.1 1.2 3.8 2.6l6.5 2.1-6.3 1c-.6 1.4-1.7 2.3-3.2 2.8-.6 3.5-.4 7.7.8 11.4 1.4 4.6.3 9-3.6 12.2-2.5 2-5.7 3.2-9.3 3.6l-.2 1.2 2.1 11.4h3.2v1.9h-5.7l-2.3-12.6-.5.1-.9 10.6h3v1.9h-5.4l1-12.5c-4.5-.4-8.5-1.8-11.6-3.9-3.1.6-6.6.5-10.5-.9 3-.8 5.3-1.8 6.9-3.1-2.2-.1-4.6-.7-7-2Z"
      />
      <circle cx="47.6" cy="10.4" r="1.25" fill="var(--c-surface, #fff)" />
    </svg>
  );
}

/** The mark beside the name, for headers. */
export function KoriLogo({ size = 30, label = "Kori" }: { size?: number; label?: string }) {
  return (
    <span className="kori-logo">
      <KoriMark size={size} />
      <span className="kori-logo-word">{label}</span>
    </span>
  );
}

const PATHS = {
  home: "M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14",
  plus: "M12 5v14M5 12h14",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  offline: "M3 3l18 18M17.5 17.5H7a4.5 4.5 0 0 1-.9-8.9M9.5 5.6A6 6 0 0 1 18 10a4 4 0 0 1 2.6 7",
  download: "M12 3v12m-5-5 5 5 5-5M4 20h16",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16",
  route: "M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16",
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  layers: "m12 3 9 5-9 5-9-5 9-5ZM3 12.5l9 5 9-5M3 16.5l9 5 9-5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  shield: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3Z",
  eyeOff: "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.7 3.3M6.6 6.6C4.2 8.2 3 12 3 12s4 6 9 6a9.6 9.6 0 0 0 4.4-1.1M10 10a3 3 0 0 0 4 4",
  tracks: "M5 21c0-4 4-5 4-9S5 7 5 3M15 3c0 4 4 5 4 9s-4 5-4 9",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01",
  alert: "M12 3 2 20h20L12 3ZM12 10v4M12 17h.01",
  key: "M8 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM11.5 12.5 21 3M17 7l3 3M14.5 9.5l2 2",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5ZM4 19a2 2 0 0 1 2-2h13",
  filter: "M3 5h18l-7 8v6l-4 2v-8L3 5Z",
  wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  sync: "M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1M18 3v4.5h-4.5M6 21v-4.5h4.5",
  sighting: "M6.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM10 16.5h4M3 16.5 5 6h4l1 7M21 16.5 19 6h-4l-1 7",
  lock: "M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z",
  storage: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3ZM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  photo: "M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  menu: "M4 7h16M4 12h16M4 17h16",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5",
  cell: "M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, strokeWidth = 2, ...props }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d={PATHS[name]} />
    </svg>
  );
}
