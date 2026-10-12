import type { MetadataRoute } from "next";
import { SITE_URL, serverApi } from "@/lib/server-api";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await serverApi.sitemap();
  const fixed = ["", "/products", "/branches", "/services", "/about", "/contact", "/faq", "/shipping-returns", "/terms", "/privacy"];
  return [
    ...fixed.map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly" as const, priority: path === "" ? 1 : 0.6 })),
    ...(data?.categories ?? []).map((c) => ({ url: `${SITE_URL}/categories/${encodeURIComponent(c)}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...(data?.products ?? []).map((p) => ({
      url: `${SITE_URL}/products/${p.id}`, changeFrequency: "daily" as const, priority: 0.9,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    })),
  ];
}
