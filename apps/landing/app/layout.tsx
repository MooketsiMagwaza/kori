import type { Metadata, Viewport } from "next";
import "@fontsource/zilla-slab/latin-600.css";
import "@fontsource/zilla-slab/latin-700.css";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/shared/theme-toggle";

export const metadata: Metadata = {
  title: "Kori · Wildlife sightings that work with no signal",
  description: "Kori is an offline-first safari and wildlife app for Botswana: log sightings with no signal, follow tracks to reviewed sightings, share by QR code. Prototype with sample data.",
  applicationName: "Kori",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  // Kept out of search engines until the owner decides to publish (see docs/DEPLOY.md).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3fbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-BW" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
