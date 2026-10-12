"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type CatalogProduct } from "@/lib/api";
import { EmptyState, ErrorBox, ProductCard } from "@/components/ui";
import {
  ActiveChips, FilterSidebar, SortSelect, applyFilters, collectFacets, countFacets, emptyFilters, sortProducts,
  type FilterState, type SortKey,
} from "@/components/CatalogFilters";

const STEP = 24; // products rendered per batch, keeps first paint light

/**
 * Filters + product grid, shared by the home page, /products and category pages.
 *
 * The filter column is always visible: a slim pinned rail on phones (small text,
 * everything on screen, no extra button to find), wider on tablets and desktops.
 * The grid sits beside it and scrolls on its own. Products appear in batches as
 * you scroll so a large catalogue stays quick.
 */
export default function CatalogBrowser({
  initial, categories, fixedCategory, title,
}: {
  initial?: CatalogProduct[];
  categories: string[];
  fixedCategory?: string;
  title?: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") || "";
  const urlCategory = fixedCategory ?? (params.get("category") || "");

  const canShowInitial = !!initial && (fixedCategory ? true : !q && !urlCategory);
  const [products, setProducts] = useState<CatalogProduct[] | null>(canShowInitial ? initial! : null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [sort, setSort] = useState<SortKey>("featured");
  const [shown, setShown] = useState(STEP);
  const [tick, setTick] = useState(0); // bumps when the store data changes
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("mj:data-changed", bump);
    return () => window.removeEventListener("mj:data-changed", bump);
  }, []);
  const sentinel = useRef<HTMLDivElement>(null);

  // Always load the complete list for this view so the filters describe everything, not just the first page.
  useEffect(() => {
    let cancelled = false;
    if (!canShowInitial && tick === 0) setProducts(null);
    setError(null);
    api.products({ q: q || undefined, category: urlCategory || undefined })
      .then((p) => { if (!cancelled) setProducts(p); })
      .catch((e) => { if (!cancelled) { if (!canShowInitial) setError(e.message); } });
    return () => { cancelled = true; };
  }, [q, urlCategory, canShowInitial, tick]);

  useEffect(() => { setShown(STEP); }, [filters, sort, q, urlCategory]);

  const facets = useMemo(() => collectFacets(products ?? []), [products]);
  const counts = useMemo(() => countFacets(products ?? []), [products]);
  const filtered = useMemo(() => sortProducts(applyFilters(products ?? [], filters), sort), [products, filters, sort]);
  const visible = filtered.slice(0, shown);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= filtered.length) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setShown((n) => n + STEP); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, filtered.length]);

  const toggleBrand = (b: string) => setFilters((f) => { const s = new Set(f.brands); if (s.has(b)) s.delete(b); else s.add(b); return { ...f, brands: s }; });
  const toggleAttr = (key: string, value: string) => setFilters((f) => {
    const attrs = new Map(f.attrs); const set = new Set(attrs.get(key) ?? []);
    if (set.has(value)) set.delete(value); else set.add(value);
    if (set.size === 0) attrs.delete(key); else attrs.set(key, set);
    return { ...f, attrs };
  });
  const setPrice = (min: number | null, max: number | null) => setFilters((f) => ({ ...f, minPrice: min, maxPrice: max }));
  const setInStock = (v: boolean) => setFilters((f) => ({ ...f, inStockOnly: v }));
  const setCategory = (c: string) => {
    const sp = new URLSearchParams(params.toString());
    if (c) sp.set("category", c); else sp.delete("category");
    router.replace(`/products${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };
  const activeCount = filters.brands.size + [...filters.attrs.values()].reduce((s, v) => s + v.size, 0)
    + (filters.inStockOnly ? 1 : 0) + (filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl px-2 py-3 sm:px-6 sm:py-8">
      <div className="grid grid-cols-[6.6rem_minmax(0,1fr)] gap-2 sm:grid-cols-[11.5rem_minmax(0,1fr)] sm:gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        {/* Filters: always visible, pinned, scrolls on its own */}
        <div>
          <div className="sticky top-[4.25rem] max-h-[calc(100vh-5.5rem)] overflow-y-auto pb-4 [scrollbar-width:thin] lg:top-[7rem] lg:max-h-[calc(100vh-8rem)]">
            <FilterSidebar
              categories={fixedCategory ? [] : categories}
              categoryCounts={counts.cat}
              category={urlCategory}
              onCategory={fixedCategory ? undefined : (c) => {
                if (typeof window !== "undefined" && window.location.pathname === "/") router.push(c ? `/products?category=${encodeURIComponent(c)}` : "/products");
                else setCategory(c);
              }}
              facets={facets}
              attrCounts={counts.attr}
              brandCounts={counts.brand}
              priceRange={counts.price}
              state={filters}
              onToggleBrand={toggleBrand}
              onToggleAttr={toggleAttr}
              onInStock={setInStock}
              onPrice={setPrice}
              onClear={() => setFilters(emptyFilters())}
              activeCount={activeCount}
            />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-black text-ink sm:text-2xl">{title}</h2>}
              <p className="text-[10px] text-faint sm:text-xs">
                {products === null ? "Loading…" : `${filtered.length} product${filtered.length !== 1 ? "s" : ""}`}
                {q && <> for “<span className="font-semibold text-ink">{q}</span>”</>}
                {urlCategory && <> in <span className="font-semibold text-ink">{urlCategory}</span></>}
              </p>
            </div>
            <SortSelect value={sort} onChange={setSort} />
          </div>

          <ActiveChips state={filters} onToggleBrand={toggleBrand} onToggleAttr={toggleAttr} onInStock={setInStock} onPrice={setPrice} />

          {error ? (
            <ErrorBox message={error} />
          ) : products === null ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-border">
                  <div className="aspect-square animate-pulse bg-surface" />
                  <div className="space-y-1.5 p-2"><div className="h-2.5 w-3/4 animate-pulse rounded bg-surface" /><div className="h-2.5 w-1/3 animate-pulse rounded bg-surface" /></div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={q ? `No results for “${q}”` : "No products match"}
              hint="Try a different search or clear the filters."
              actionHref={fixedCategory ? `/categories/${encodeURIComponent(fixedCategory)}` : "/products"}
              actionLabel="Clear filters"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
                {visible.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
              </div>
              {shown < filtered.length && (
                <div ref={sentinel} className="mt-6 flex justify-center">
                  <button onClick={() => setShown((n) => n + STEP)} className="rounded-full border border-border px-6 py-2 text-xs font-semibold text-ink hover:bg-surface">
                    Show more ({filtered.length - shown} left)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
