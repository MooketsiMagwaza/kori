"use client";

/** The field app's frame: a top bar and bottom bar on phones, a left rail on wide screens. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, KoriLogo, type IconName } from "@/shared/icons";
import { ThemeToggle } from "@/shared/theme-toggle";
import { useOnline } from "@/lib/hooks";

const LINKS: { href: string; label: string; icon: IconName; log?: boolean }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/map", label: "Map", icon: "map" },
  { href: "/log", label: "Log", icon: "plus", log: true },
  { href: "/sightings", label: "Sightings", icon: "sighting" },
  { href: "/offline", label: "Offline", icon: "download" },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/sightings") return pathname.startsWith("/sightings") || pathname.startsWith("/sighting");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={`nav-item${link.log ? " nav-log" : ""}`} aria-current={isCurrent(pathname, link.href) ? "page" : undefined}>
          <span className="nav-icon">
            <Icon name={link.icon} size={link.log ? 28 : 24} />
          </span>
          <span>{link.label}</span>
        </Link>
      ))}
    </>
  );
}

export function ConnectionPill() {
  const online = useOnline();
  return (
    <Link href="/offline" className={`conn ${online ? "conn-online" : "conn-offline"}`}>
      <Icon name={online ? "wifi" : "offline"} size={16} />
      {online ? "Online" : "No signal"}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/" className="kori-logo" aria-label="Kori home">
          <KoriLogo size={34} />
        </Link>
        <div className="topbar-end">
          <ConnectionPill />
          <ThemeToggle />
        </div>
      </header>
      <aside className="rail" aria-label="Main">
        <Link href="/" aria-label="Kori home">
          <KoriLogo size={44} />
        </Link>
        <nav aria-label="Main sections" style={{ display: "contents" }}>
          <NavLinks />
        </nav>
        <div className="rail-end">
          <ConnectionPill />
          <ThemeToggle withLabel />
        </div>
      </aside>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Main sections">
        <NavLinks />
      </nav>
    </div>
  );
}
