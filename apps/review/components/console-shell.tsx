"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, KoriMark, type IconName } from "@/shared/icons";
import { ThemeToggle } from "@/shared/theme-toggle";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Queue", icon: "list" },
  { href: "/species", label: "Species rules", icon: "shield" },
  { href: "/audit", label: "Audit log", icon: "book" },
];

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="console">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="console-bar">
        <Link href="/" className="kori-logo" aria-label="Kori review console">
          <KoriMark size={32} />
          <span className="kori-logo-word">Kori</span>
          <span className="console-tag">Review</span>
        </Link>
        <nav aria-label="Console" className="console-nav">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
              <Icon name={link.icon} size={20} />
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </header>
      <p className="console-proto">
        <Icon name="info" size={18} />
        <span>Prototype with sample data. There is no sign-in yet, and decisions are kept in this browser only.</span>
      </p>
      <main id="main" tabIndex={-1} className="console-main">
        {children}
      </main>
    </div>
  );
}
