import type { Metadata, Viewport } from "next";
import "@fontsource/zilla-slab/latin-600.css";
import "@fontsource/zilla-slab/latin-700.css";
import "./globals.css";
import "./console.css";
import { ConsoleShell } from "@/components/console-shell";
import { THEME_INIT_SCRIPT } from "@/shared/theme-toggle";

export const metadata: Metadata = {
  title: { default: "Review · Kori", template: "%s · Kori review" },
  description: "Kori's review console: check sightings before anyone else sees them. Prototype with sample data.",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3fbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1317" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-BW" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ConsoleShell>{children}</ConsoleShell>
      </body>
    </html>
  );
}
