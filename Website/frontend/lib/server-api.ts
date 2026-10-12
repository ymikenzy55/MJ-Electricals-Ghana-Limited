import type { CatalogProduct, SiteSettings } from "./api";

/**
 * Server-side data helpers. Responses are cached by Next.js for a short time
 * (ISR-style) so pages render from memory instead of hitting the API and the
 * remote database on every visit.
 */
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

async function get<T>(path: string, revalidate = 3): Promise<T | null> {
  try {
    // revalidate 0 means always live: the first visitor after a quiet spell must not see an old copy.
    const res = await fetch(`${API}${path}`, revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const serverApi = {
  settings: () => get<SiteSettings>("/api/v1/catalog/site-settings", 3),
  categories: () => get<string[]>("/api/v1/catalog/categories", 0),
  products: (qs = "") => get<{ items: CatalogProduct[]; total: number }>(`/api/v1/catalog/products${qs}`, 0),
  product: (id: string | number) => get<CatalogProduct>(`/api/v1/catalog/products/${id}`, 0),
  related: (id: string | number, limit = 8) => get<CatalogProduct[]>(`/api/v1/catalog/products/${id}/related?limit=${limit}`, 0),
  sitemap: () => get<{ products: { id: number; updated_at: string | null }[]; categories: string[] }>("/api/v1/catalog/sitemap", 300),
};

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
