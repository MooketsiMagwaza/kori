import type { Metadata, Viewport } from "next";
import "@fontsource/zilla-slab/latin-600.css";
import "@fontsource/zilla-slab/latin-700.css";
import "./globals.css";
import { DocsShell } from "@/components/docs-shell";
import { THEME_INIT_SCRIPT } from "@/shared/theme-toggle";

export const metadata: Metadata = {
  title: { default: "Kori API", template: "%s · Kori API" },
  description: "The Kori API for reviewed wildlife sightings in Botswana: keys, scopes, rate limits, endpoints and data rules. Draft; not deployed.",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f0e4" },
    { media: "(prefers-color-scheme: dark)", color: "#14110d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-BW" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <DocsShell>{children}</DocsShell>
      </body>
    </html>
  );
}
