import type { NextConfig } from "next";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const dev = process.env.NODE_ENV === "development";

// The POS is an internal tool: scripts from this site only, images from
// anywhere over https (product photos on Cloudinary), API calls to our backend.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${api} https://api.cloudinary.com http://localhost:8001 http://localhost:8002 http://127.0.0.1:8001 http://127.0.0.1:8002${dev ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // The till installer (installer/build-installer.ps1) ships a self-contained
  // server.js instead of node_modules; normal builds are unchanged.
  ...(process.env.MJPOS_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  allowedDevOrigins: ["127.0.0.1", "http://127.0.0.1:9809"],
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must always be revalidated so updates roll out.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
