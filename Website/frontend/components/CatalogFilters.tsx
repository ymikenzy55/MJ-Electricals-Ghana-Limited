"use client";

import type { CatalogProduct } from "@/lib/api";

export interface AttrFacet {
  key: string;
  values: string[];
}

export interface CatalogFacets {
  brands: string[];
  attributes: AttrFacet[];
}

/** Facets derived from the products currently in scope. Option groups only
 *  surface when more than one distinct value exists: a single value is noise, not a filter. */
export function collectFacets(products: CatalogProduct[]): CatalogFacets {
  const brands = new Map<string, number>();
  const attrs = new Map<string, Set<string>>();
  for (const p of products) {
    if (p.brand) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);
    for (const v of p.variants) {
      for (const [k, val] of Object.entries(v.attributes || {})) {
        if (!val) continue;
        if (!attrs.has(k)) attrs.set(k, new Set());
        attrs.get(k)!.add(val);
      }
    }
  }
  return {
    brands: [...brands.keys()].sort((a, b) => a.localeCompare(b)),
    attributes: [...attrs.entries()]
      .map(([key, values]) => ({ key, values: [...values].sort(naturalCompare) }))
      .filter((f) => f.values.length > 1)
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

/** "1.5 mm" before "10 mm", "6W" before "12W". */
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** How many products carry each option value (a product counts once per value). */
export function countFacets(products: CatalogProduct[]) {
  const attr: Record<string, Record<string, number>> = {};
  const brand: Record<string, number> = {};
  const cat: Record<string, number> = {};
  let lo = Infinity, hi = 0;
  for (const p of products) {
    if (p.brand) brand[p.brand] = (brand[p.brand] ?? 0) + 1;
    if (p.category) cat[p.category] = (cat[p.category] ?? 0) + 1;
    const seen = new Set<string>();
    for (const v of p.variants) {
      const price = parseFloat(v.selling_price);
      if (!Number.isNaN(price)) { lo = Math.min(lo, price); hi = Math.max(hi, price); }
      for (const [k, val] of Object.entries(v.attributes || {})) {
        const id = `${k}\u0000${val}`;
        if (!val || seen.has(id)) continue;
        seen.add(id);
        (attr[k] ??= {})[val] = (attr[k][val] ?? 0) + 1;
      }
    }
  }
  return { attr, brand, cat, price: (lo === Infinity ? [0, 0] : [lo, hi]) as [number, number] };
}

export interface FilterState {
  q: string;
  brands: Set<string>;
  attrs: Map<string, Set<string>>;
  inStockOnly: boolean;
  minPrice: number | null;
  maxPrice: number | null;
}

export const emptyFilters = (): FilterState => ({
  q: "", brands: new Set(), attrs: new Map(), inStockOnly: false, minPrice: null, maxPrice: null,
});

export function productInStock(p: CatalogProduct): boolean {
  return p.variants.some((v) => parseFloat(v.available_quantity || "0") > 0);
}

export function productMinPrice(p: CatalogProduct): number {
  const prices = p.variants.map((v) => parseFloat(v.selling_price)).filter((n) => !Number.isNaN(n));
  return prices.length ? Math.min(...prices) : 0;
}

/** A product matches when ONE of its variants satisfies every chosen option at once
 *  (Colour Red and Size 6 mm must be the same variant, not two different ones). */
export function applyFilters(products: CatalogProduct[], f: FilterState): CatalogProduct[] {
  const chosen = [...f.attrs.entries()].filter(([, v]) => v.size > 0);
  return products.filter((p) => {
    if (f.brands.size > 0 && (!p.brand || !f.brands.has(p.brand))) return false;
    return p.variants.some((v) => {
      if (f.inStockOnly && !(parseFloat(v.available_quantity || "0") > 0)) return false;
      const price = parseFloat(v.selling_price);
      if (f.minPrice !== null && price < f.minPrice) return false;
      if (f.maxPrice !== null && price > f.maxPrice) return false;
      for (const [key, values] of chosen) {
        const val = (v.attributes || {})[key];
        if (val === undefined || !values.has(val)) return false;
      }
      return true;
    });
  });
}

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export function sortProducts(products: CatalogProduct[], sort: SortKey): CatalogProduct[] {
  const list = [...products];
  if (sort === "price-asc") list.sort((a, b) => productMinPrice(a) - productMinPrice(b));
  else if (sort === "price-desc") list.sort((a, b) => productMinPrice(b) - productMinPrice(a));
  else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

/** Colour names to swatches, so colour options read at a glance. */
const SWATCH: Record<string, string> = {
  red: "#dc2626", black: "#111827", blue: "#2563eb", brown: "#78350f", white: "#ffffff", gold: "#ca8a04", silver: "#9ca3af",
  "satin nickel": "#a8a29e", bronze: "#92400e", green: "#16a34a", yellow: "#facc15", grey: "#6b7280", amber: "#f59e0b",
  pink: "#ec4899", orange: "#f97316", cream: "#fef3c7", coffee: "#57534e", chrome: "#d1d5db", "green/yellow (earth)": "#65a30d", clear: "#e5e7eb",
};
export const swatchFor = (v: string): string | undefined => SWATCH[v.toLowerCase()];
export const isColourKey = (k: string) => /colou?r/i.test(k) && !/temp/i.test(k);

const KEY_ORDER = ["Colour", "Size", "Wattage", "Base", "Colour temperature", "Rating", "Ways", "Phase", "Gangs", "Cores", "Shape", "Finish", "Light colour"];
const keyRank = (k: string) => { const i = KEY_ORDER.indexOf(k); return i === -1 ? 99 : i; };

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-border bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted sm:px-3 sm:py-2 sm:text-[11px] [&::-webkit-details-marker]:hidden">
        {title}
        <svg className="h-3 w-3 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="px-1.5 pb-1.5 sm:px-2 sm:pb-2">{children}</div>
    </details>
  );
}

function CheckRow({ checked, onChange, label, count, swatch }: { checked: boolean; onChange: () => void; label: string; count?: number; swatch?: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 text-[11px] leading-tight sm:px-1.5 sm:text-[13px] ${checked ? "bg-primary/10 font-semibold text-primary" : "text-ink hover:bg-surface"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 shrink-0 accent-primary sm:h-4 sm:w-4" />
      {swatch && <span className="h-3 w-3 shrink-0 rounded-full border border-border sm:h-3.5 sm:w-3.5" style={{ background: swatch }} aria-hidden />}
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {count !== undefined && <span className="shrink-0 text-[10px] font-normal text-faint sm:text-[11px]">{count}</span>}
    </label>
  );
}

export function FilterSidebar({
  categories, categoryCounts, category, onCategory, facets, attrCounts, brandCounts, priceRange, state,
  onToggleBrand, onToggleAttr, onInStock, onPrice, onClear, activeCount,
}: {
  categories: string[];
  categoryCounts: Record<string, number>;
  category: string;
  onCategory?: (c: string) => void;
  facets: CatalogFacets;
  attrCounts: Record<string, Record<string, number>>;
  brandCounts: Record<string, number>;
  priceRange: [number, number];
  state: FilterState;
  onToggleBrand: (b: string) => void;
  onToggleAttr: (key: string, value: string) => void;
  onInStock: (v: boolean) => void;
  onPrice: (min: number | null, max: number | null) => void;
  onClear: () => void;
  activeCount: number;
}) {
  const attrs = [...facets.attributes].sort((a, b) => keyRank(a.key) - keyRank(b.key) || a.key.localeCompare(b.key));
  const [lo, hi] = priceRange;
  const ranges: [number, number | null][] = [[0, 100], [100, 500], [500, 2000], [2000, null]];
  return (
    <aside className="space-y-1.5 sm:space-y-2.5">
      {activeCount > 0 && (
        <button onClick={onClear} className="w-full rounded-md bg-accent/10 px-2 py-1 text-left text-[11px] font-bold text-accent hover:bg-accent/20 sm:text-xs">
          Clear filters ({activeCount})
        </button>
      )}

      {onCategory && categories.length > 0 && (
        <Section title="Category">
          <div className="space-y-0.5">
            <CheckRow checked={!category} onChange={() => onCategory("")} label="All products" />
            {categories.map((c) => (
              <CheckRow key={c} checked={category === c} onChange={() => onCategory(c === category ? "" : c)} label={c} count={categoryCounts[c]} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Availability">
        <CheckRow checked={state.inStockOnly} onChange={() => onInStock(!state.inStockOnly)} label="In stock only" />
      </Section>

      {hi > lo && (
        <Section title="Price (₵)">
          <div className="flex items-center gap-1 px-0.5">
            <input
              type="number" inputMode="numeric" min={0} placeholder={String(Math.floor(lo))} value={state.minPrice ?? ""}
              onChange={(e) => onPrice(e.target.value === "" ? null : Math.max(0, Number(e.target.value)), state.maxPrice)}
              aria-label="Minimum price" className="w-full min-w-0 rounded-md border border-border px-1.5 py-1 text-[11px] outline-none focus:border-primary sm:text-xs"
            />
            <span className="text-faint">-</span>
            <input
              type="number" inputMode="numeric" min={0} placeholder={String(Math.ceil(hi))} value={state.maxPrice ?? ""}
              onChange={(e) => onPrice(state.minPrice, e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
              aria-label="Maximum price" className="w-full min-w-0 rounded-md border border-border px-1.5 py-1 text-[11px] outline-none focus:border-primary sm:text-xs"
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {ranges.map(([a, b]) => {
              const on = state.minPrice === a && state.maxPrice === b;
              return (
                <button key={`${a}-${b}`} onClick={() => (on ? onPrice(null, null) : onPrice(a, b))}
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-[11px] ${on ? "border-primary bg-primary text-white" : "border-border text-ink hover:bg-surface"}`}>
                  {b === null ? `${a}+` : `${a}-${b}`}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {facets.brands.length > 1 && (
        <Section title="Brand">
          <div className="space-y-0.5">
            {facets.brands.map((b) => (
              <CheckRow key={b} checked={state.brands.has(b)} onChange={() => onToggleBrand(b)} label={b} count={brandCounts[b]} />
            ))}
          </div>
        </Section>
      )}

      {attrs.map((f) => (
        <Section key={f.key} title={f.key}>
          <div className="space-y-0.5">
            {f.values.map((v) => (
              <CheckRow key={v} checked={state.attrs.get(f.key)?.has(v) ?? false} onChange={() => onToggleAttr(f.key, v)} label={v}
                count={attrCounts[f.key]?.[v]} swatch={isColourKey(f.key) ? swatchFor(v) : undefined} />
            ))}
          </div>
        </Section>
      ))}
    </aside>
  );
}

/** Chips for every active filter, each removable, so it is always clear what is applied. */
export function ActiveChips({ state, onToggleBrand, onToggleAttr, onInStock, onPrice }: {
  state: FilterState;
  onToggleBrand: (b: string) => void;
  onToggleAttr: (k: string, v: string) => void;
  onInStock: (v: boolean) => void;
  onPrice: (min: number | null, max: number | null) => void;
}) {
  const chips: { label: string; off: () => void }[] = [];
  state.brands.forEach((b) => chips.push({ label: b, off: () => onToggleBrand(b) }));
  state.attrs.forEach((vals, k) => vals.forEach((v) => chips.push({ label: `${k}: ${v}`, off: () => onToggleAttr(k, v) })));
  if (state.inStockOnly) chips.push({ label: "In stock", off: () => onInStock(false) });
  if (state.minPrice !== null || state.maxPrice !== null) {
    chips.push({ label: `₵${state.minPrice ?? 0}${state.maxPrice !== null ? ` to ₵${state.maxPrice}` : "+"}`, off: () => onPrice(null, null) });
  }
  if (!chips.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {chips.map((c) => (
        <button key={c.label} onClick={c.off} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 sm:text-xs">
          {c.label}<span aria-hidden>×</span><span className="sr-only">remove</span>
        </button>
      ))}
    </div>
  );
}

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="h-8 rounded-full border border-border bg-white px-2 text-[11px] font-semibold text-ink outline-none focus:border-primary sm:h-9 sm:px-4 sm:text-xs"
      aria-label="Sort products"
    >
      <option value="featured">Featured</option>
      <option value="price-asc">Price: low to high</option>
      <option value="price-desc">Price: high to low</option>
      <option value="name">Name: A to Z</option>
    </select>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-8 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-40"
      >
        Previous
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => onPage(n)}
          aria-current={n === page ? "page" : undefined}
          className={`h-8 w-8 rounded-full text-xs font-bold ${n === page ? "bg-primary text-white" : "text-muted hover:bg-surface"}`}
        >
          {n}
        </button>
      ))}
      <button
        disabled={page === pages}
        onClick={() => onPage(page + 1)}
        className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
