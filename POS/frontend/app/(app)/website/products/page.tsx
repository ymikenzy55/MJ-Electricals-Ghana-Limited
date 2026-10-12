"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui";
import { websiteApi, WebsiteApiError, type WebsiteProduct } from "@/lib/website-api";

export default function WebsiteProductsPage() {
  const [products, setProducts] = useState<WebsiteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "unpublished">("all");
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (f: string, q: string) => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (f === "published") params.published = true;
      else if (f === "unpublished") params.published = false;
      if (q) params.q = q;
      setProducts(await websiteApi<WebsiteProduct[]>("/api/v1/admin/products", { params }));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter, search); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch(q: string) {
    setSearch(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(filter, q).catch(() => null), 300);
  }

  async function toggle(p: WebsiteProduct) {
    setToggling(p.id);
    setError(null);
    try {
      await websiteApi(`/api/v1/admin/products/${p.id}`, {
        method: "PATCH",
        body: { is_published: !p.is_published },
      });
      setProducts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, is_published: !p.is_published } : x)),
      );
    } catch (e) {
      setError(e instanceof WebsiteApiError ? e.message : "Failed to update product");
    } finally {
      setToggling(null);
    }
  }

  const publishedCount = products.filter((p) => p.is_published).length;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Website Products"
        breadcrumb="Website / Products"
        subtitle="Control which POS products appear on the public website"
      />

      {error && (
        <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search products..."
          className="w-72 rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
        />
        <div className="flex gap-1 rounded-xl border border-[#DADDE6] bg-white p-1 text-sm">
          {(["all", "published", "unpublished"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 font-medium capitalize ${
                filter === f ? "bg-[#061161] text-white" : "text-[#4A5060] hover:bg-[#EDEFF9]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-sm text-[#4A5060]">{publishedCount} published of {products.length}</span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">Loading products...</div>
      ) : products.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#DADDE6] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
              <tr>
                <th className="px-4 py-2 w-16">Image</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Variants</th>
                <th className="px-4 py-2">Website Status</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
                  <td className="px-4 py-3">
                    <div className="h-10 w-10 overflow-hidden rounded-xl border border-[#DADDE6] bg-[#EDEFF9]">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="h-full w-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#6B7183]">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#0B0E1A]">{p.name}</div>
                    {!p.is_active && <div className="text-xs text-[#C62828]">Inactive</div>}
                  </td>
                  <td className="px-4 py-3 text-[#4A5060]">{p.category ?? "-"}</td>
                  <td className="px-4 py-3 text-[#4A5060]">{p.variants_count}</td>
                  <td className="px-4 py-3">
                    {p.is_published ? (
                      <span className="rounded-full bg-[#16803C]/15 px-2 py-0.5 text-xs font-semibold text-[#16803C]">Published</span>
                    ) : (
                      <span className="rounded-full bg-[#EDEFF9] px-2 py-0.5 text-xs font-semibold text-[#4A5060]">Not published</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(p)}
                      disabled={toggling === p.id}
                      className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        p.is_published
                          ? "border border-[#C62828]/30 text-[#C62828] hover:bg-[#C62828]/10"
                          : "border border-[#16803C]/30 text-[#16803C] hover:bg-[#16803C]/10"
                      }`}
                    >
                      {toggling === p.id ? "..." : p.is_published ? "Unpublish" : "Publish"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">
          No products match
        </div>
      )}
    </div>
  );
}
