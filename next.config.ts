import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // Every page shows one user's private, frequently-changing data, so we
  // render per request instead of using Cache Components (see docs/adr/0002).
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // Tabs feel instant: a page you've seen in the last 2 minutes opens from the browser's copy, and fully
    // prefetched tabs stay fresh for 5. Any save (server action) clears this cache, so changes always show.
    staleTimes: { dynamic: 120, static: 300 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Pages merged in the owner's reset (2026-11-10, the page map): old addresses keep working. Done here rather than in the
  // page, because a page under a streamed loading screen can't redirect before it starts sending. The query string goes along.
  async redirects() {
    return [
      // merge 9: an old chat opens inside the one chat
      { source: "/jarvis/:id([0-9a-fA-F-]{36})", destination: "/jarvis?c=:id", permanent: false },
      // merge 13: the clouds do what Ideas did
      { source: "/jarvis/ideas", destination: "/jarvis", permanent: false },
      // merge 4: what the skyling knows is part of its one page
      { source: "/jarvis/memory", destination: "/jarvis/profile#memory", permanent: false },
      // merge 3: Filed is part of the one Updates page
      { source: "/inbox", destination: "/jarvis/says#filed", permanent: false },
    ];
  },
};

export default nextConfig;
