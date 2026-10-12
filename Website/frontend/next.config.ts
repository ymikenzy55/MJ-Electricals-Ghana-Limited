import type { NextConfig } from "next";

const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

// Content-Security-Policy: scripts only from this site (Next injects inline
// bootstrap scripts, hence 'unsafe-inline'), images from anywhere over https
// (product photos are hosted on Cloudinary), API calls only to our backend.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
  "font-src 'self' data: https://cdn.fontshare.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${api}` + (process.env.NODE_ENV === "development" ? " ws: http://localhost:* http://127.0.0.1:*" : ""),
  "frame-src https://www.google.com https://maps.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/:all*(jpg|jpeg|png|webp|avif|svg|ico|woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
