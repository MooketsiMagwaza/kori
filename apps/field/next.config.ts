import type { NextConfig } from "next";

/**
 * Security headers for the field app. The camera is allowed only for this origin (QR scanning) and
 * geolocation only for this origin (your position on the map, trip recording). The service worker
 * is never cached by the browser's HTTP cache, so an update reaches phones on the next visit.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Do not let `next dev` write agent instruction files into the app folder.
  agentRules: false,
  headers() {
    return Promise.resolve([
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
    ]);
  },
};

export default nextConfig;
