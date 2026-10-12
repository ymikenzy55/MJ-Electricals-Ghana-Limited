import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/server-api";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/checkout", "/cart", "/track", "/login", "/register", "/reset-password", "/forgot-password"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
