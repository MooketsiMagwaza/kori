"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KoriMark } from "@/shared/icons";
import { ThemeToggle } from "@/shared/theme-toggle";

export const PAGES = [
  { href: "/", label: "Overview" },
  { href: "/keys", label: "Keys and scopes" },
  { href: "/limits", label: "Rate limits" },
  { href: "/reference", label: "Endpoints" },
  { href: "/data-rules", label: "Data rules and licences" },
];

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="docs">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="docs-bar">
        <Link href="/" className="kori-logo" aria-label="Kori API docs">
          <KoriMark size={30} />
          <span className="kori-logo-word">Kori</span>
          <span className="docs-tag">API</span>
        </Link>
        <ThemeToggle />
      </header>
      <div className="docs-body">
        <nav className="docs-nav" aria-label="Documentation">
          {PAGES.map((page) => (
            <Link key={page.href} href={page.href} aria-current={pathname === page.href ? "page" : undefined}>
              {page.label}
            </Link>
          ))}
        </nav>
        <main id="main" tabIndex={-1} className="docs-main">
          <p className="docs-status">
            <strong>Draft.</strong> The API is designed but not deployed. Examples are built from Kori&apos;s sample data through the same rules the app uses.
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
