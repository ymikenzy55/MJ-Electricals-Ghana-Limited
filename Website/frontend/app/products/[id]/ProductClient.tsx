"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, cedi, fmtDate, type CatalogProduct, type CatalogVariant, type ReviewSummary } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductCard, ProductImage, Stars, WishlistButton } from "@/components/ui";
import { isColourKey, naturalCompare, swatchFor } from "@/components/CatalogFilters";

function Reviews({ product }: { product: CatalogProduct }) {
  const { token, user } = useAuth();
  const [data, setData] = useState<ReviewSummary | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.reviews(product.id, token).then(setData).catch(() => {});
  }, [product.id, token]);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await api.addReview(product.id, token, { rating, title: title || undefined, body: body || undefined });
      setTitle(""); setBody("");
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not post review"); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-8 sm:mt-16" aria-labelledby="reviews-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews-h" className="text-xl font-black text-ink">Customer reviews</h2>
        {data && data.count > 0 && (
          <div className="flex items-center gap-2"><Stars value={data.average} size="h-5 w-5" /><span className="text-sm font-bold text-ink">{data.average}</span><span className="text-xs text-muted">({data.count} review{data.count !== 1 ? "s" : ""})</span></div>
        )}
      </div>

      {data?.can_review && (
        <form onSubmit={submit} className="mt-5 space-y-3 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-bold text-ink">Share your experience</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
                <svg className={`h-7 w-7 ${n <= rating ? "text-amber-400" : "text-border"}`} viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" /></svg>
              </button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Headline (optional)" className="h-11 w-full rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-primary" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="What did you like or dislike?" className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
          {error && <p className="text-xs font-medium text-error">{error}</p>}
          <button disabled={busy} className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">{busy ? "Posting…" : "Post review"}</button>
        </form>
      )}
      {data?.already_reviewed && <p className="mt-4 text-xs text-muted">Thanks, you&apos;ve already reviewed this product.</p>}
      {!user && <p className="mt-4 text-xs text-muted"><Link href={`/login?next=/products/${product.id}`} className="font-semibold text-primary hover:underline">Sign in</Link> to review products you&apos;ve purchased.</p>}

      {data && data.reviews.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border bg-surface p-5 sm:p-8 text-center text-sm text-muted">No reviews yet. Verified buyers can leave the first one.</p>
      ) : (
        <ul className="mt-5 divide-y divide-border rounded-xl border border-border bg-white">
          {data?.reviews.map((r) => (
            <li key={r.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2"><Stars value={r.rating} /><span className="text-sm font-bold text-ink">{r.title}</span></div>
              {r.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted">{r.body}</p>}
              <p className="mt-2 text-xs text-faint">{r.author_name} · {fmtDate(r.created_at)} · <span className="font-semibold text-success">Verified purchase</span></p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ProductClient({ product, related }: { product: CatalogProduct; related: CatalogProduct[] }) {
  const router = useRouter();
  const { add } = useCart();
  const [variantId, setVariantId] = useState<number | null>(product.variants[0]?.id ?? null);
  // always the live copy, so a price or stock change shows up instantly
  const variant: CatalogVariant | null = product.variants.find((v) => v.id === variantId) ?? product.variants[0] ?? null;
  const setVariant = (v: CatalogVariant) => setVariantId(v.id);
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [shared, setShared] = useState(false);

  const gallery: { url: string | null; label: string }[] = [
    { url: product.image_url, label: "Main view" },
    ...product.extra_images.map((e) => ({ url: e.url, label: e.label || "Option" })),
  ];
  const activeImg = gallery[Math.min(imgIdx, gallery.length - 1)];
  const selectedLabel = imgIdx > 0 ? product.extra_images[imgIdx - 1]?.label || null : null;

  const stock = variant ? parseFloat(variant.available_quantity || "0") : 0;
  const inStock = stock > 0;
  const lowStock = inStock && stock <= 5;
  const attrEntries = variant ? Object.entries(variant.attributes || {}) : [];

  // Option groups (Colour, Size, Wattage...) built from the variants' attributes.
  const groups = (() => {
    const map = new Map<string, Set<string>>();
    for (const v of product.variants) for (const [k, val] of Object.entries(v.attributes || {})) { if (val) { if (!map.has(k)) map.set(k, new Set()); map.get(k)!.add(val); } }
    return [...map.entries()].filter(([, vals]) => vals.size > 0).map(([key, vals]) => ({ key, values: [...vals].sort(naturalCompare) }));
  })();
  const useGroups = groups.length > 0 && product.variants.length > 1;

  /** Pick the variant that has `value` for `key` and agrees with the current choice on as many other options as possible. */
  function choose(key: string, value: string) {
    const cur = variant?.attributes || {};
    const candidates = product.variants.filter((v) => (v.attributes || {})[key] === value);
    if (!candidates.length) return;
    const score = (v: CatalogVariant) => Object.entries(cur).filter(([k, val]) => k !== key && (v.attributes || {})[k] === val).length * 10
      + (parseFloat(v.available_quantity || "0") > 0 ? 1 : 0);
    const best = candidates.sort((a, b) => score(b) - score(a))[0];
    setVariantId(best.id); setQty(1);
  }
  /** Is there any variant with this value, given the other options already chosen? */
  function reachable(key: string, value: string) {
    const cur = variant?.attributes || {};
    return product.variants.some((v) => (v.attributes || {})[key] === value
      && Object.entries(cur).every(([k, val]) => k === key || (v.attributes || {})[k] === val));
  }

  function addToCart(): boolean {
    if (!variant || !inStock) return false;
    add(
      {
        variantId: variant.id, productId: product.id, productName: product.name,
        variantName: variant.variant_name, optionLabel: selectedLabel, sku: variant.sku,
        unit: variant.unit, price: parseFloat(variant.selling_price),
        image: activeImg.url || product.image_url, maxQuantity: Math.floor(stock),
      },
      qty
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    return true;
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); }
    } catch { /* user cancelled */ }
  }

  return (
    <div className="mx-auto max-w-7xl px-3 pb-28 pt-3 sm:px-6 sm:py-10 md:pb-10">
      <Breadcrumbs
        className="-mx-3 mb-3 sm:-mx-6 sm:mb-5"
        items={[
          { label: "Products", href: "/products" },
          ...(product.category ? [{ label: product.category, href: `/categories/${encodeURIComponent(product.category)}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="grid gap-5 sm:gap-10 md:grid-cols-2">
        <div>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
            <ProductImage src={activeImg.url} alt={product.name} className="aspect-[4/3] h-full w-full sm:aspect-square" priority />
            {selectedLabel && <span className="absolute left-4 top-4 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-lg">{selectedLabel}</span>}
            <WishlistButton id={product.id} className="absolute right-4 top-4 !h-10 !w-10" />
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {gallery.map((g, i) => (
                <button key={i} onClick={() => setImgIdx(i)} aria-label={`Show ${g.label}`}
                  className={`relative w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${i === imgIdx ? "border-primary" : "border-border hover:border-primary/50"}`} title={g.label}>
                  <ProductImage src={g.url} alt={g.label} className="aspect-square h-full w-full" />
                </button>
              ))}
            </div>
          )}
          {gallery.length > 1 && (
            <p className="mt-2 text-xs font-medium text-muted">
              Viewing: <span className="font-bold text-ink">{activeImg.label}</span>
              {selectedLabel && <span className="text-faint">, this option is added to your order</span>}
            </p>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {product.category && <Link href={`/categories/${encodeURIComponent(product.category)}`} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20">{product.category}</Link>}
            {product.brand && <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted">{product.brand}</span>}
          </div>
          <h1 className="mt-2 text-xl font-black leading-tight text-ink sm:mt-3 sm:text-3xl">{product.name}</h1>
          {!!product.rating_count && <a href="#reviews-h" className="mt-2 inline-block"><Stars value={product.rating_avg} count={product.rating_count} size="h-4 w-4" /></a>}
          {product.description && <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-muted sm:mt-4 sm:text-sm">{product.description}</p>}

          {useGroups ? (
            <div className="mt-6 space-y-4">
              {groups.map((g) => (
                <div key={g.key}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                    {g.key}: <span className="normal-case tracking-normal text-ink">{(variant?.attributes || {})[g.key] ?? ""}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {g.values.map((val) => {
                      const sel = (variant?.attributes || {})[g.key] === val;
                      const ok = reachable(g.key, val);
                      const sw = isColourKey(g.key) ? swatchFor(val) : undefined;
                      return (
                        <button key={val} onClick={() => choose(g.key, val)} aria-pressed={sel}
                          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${sel ? "border-primary bg-primary text-white" : ok ? "border-border bg-white text-ink hover:border-primary" : "border-dashed border-border bg-surface text-faint hover:border-primary/40"}`}>
                          {sw && <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: sw }} aria-hidden />}
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : product.variants.length > 1 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Options</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const vStock = parseFloat(v.available_quantity || "0");
                  const sel = variant?.id === v.id;
                  return (
                    <button key={v.id} onClick={() => { setVariant(v); setQty(1); }} disabled={vStock <= 0} aria-pressed={sel}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${sel ? "border-primary bg-primary text-white" : vStock <= 0 ? "cursor-not-allowed border-border bg-surface text-faint line-through" : "border-border bg-white text-ink hover:border-primary"}`}>
                      {v.variant_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!useGroups && attrEntries.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {attrEntries.map(([k, v]) => (
                <span key={k} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted"><span className="font-semibold text-ink">{k}:</span> {v}</span>
              ))}
            </div>
          )}

          {variant && (
            <div className="mt-6">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl sm:text-3xl font-black text-primary">{cedi(variant.selling_price)}</span>
                <span className="text-sm text-muted">/ {variant.unit}</span>
              </div>
              <p className="mt-1 text-xs text-faint">SKU: {variant.sku}</p>
              <p className={`mt-2 text-sm font-semibold ${inStock ? (lowStock ? "text-warning" : "text-success") : "text-error"}`} role="status">
                {inStock ? (lowStock ? `Only ${Math.floor(stock)} left, order soon` : "In stock") : "Out of stock"}
              </p>
            </div>
          )}

          <div className="mt-5 hidden flex-wrap items-center gap-3 sm:mt-8 md:flex">
            <div className="flex items-center rounded-full border border-border">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-2.5 text-lg font-bold text-muted hover:text-ink" aria-label="Decrease quantity">−</button>
              <span className="w-10 text-center text-sm font-bold" aria-live="polite">{qty}</span>
              <button onClick={() => setQty(Math.min(Math.floor(stock) || 1, qty + 1))} className="px-4 py-2.5 text-lg font-bold text-muted hover:text-ink" aria-label="Increase quantity">+</button>
            </div>
            <button onClick={addToCart} disabled={!inStock}
              className="flex-1 rounded-full bg-primary px-8 py-3 text-sm font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
              {added ? "Added to cart ✓" : "Add to Cart"}
            </button>
            <button onClick={() => { if (addToCart()) router.push("/checkout"); }} disabled={!inStock}
              className="rounded-full bg-accent px-8 py-3 text-sm font-bold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40">
              Buy Now
            </button>
            <button onClick={share} className="rounded-full border border-border px-4 py-3 text-xs font-semibold text-muted hover:bg-surface">{shared ? "Link copied" : "Share"}</button>
          </div>

          <div className="mt-5 sm:mt-8 grid gap-3 rounded-xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted sm:grid-cols-2">
            <div><p className="font-semibold text-ink">Delivery &amp; Pickup</p><p className="mt-1">Nationwide delivery, or collect free at any branch.</p></div>
            <div><p className="font-semibold text-ink">Genuine products</p><p className="mt-1">Read our <Link href="/shipping-returns" className="font-semibold text-primary hover:underline">shipping &amp; returns policy</Link>.</p></div>
          </div>
        </div>
      </div>

      {/* Mobile sticky buy bar (above the bottom navigation) */}
      <div className="fixed inset-x-0 bottom-[3.6rem] z-30 border-t border-border bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,.06)] md:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="flex items-center rounded-full border border-border">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="h-9 w-8 font-bold text-muted" aria-label="Decrease quantity">−</button>
            <span className="w-6 text-center text-xs font-bold">{qty}</span>
            <button onClick={() => setQty(Math.min(Math.floor(stock) || 1, qty + 1))} className="h-9 w-8 font-bold text-muted" aria-label="Increase quantity">+</button>
          </div>
          <button onClick={addToCart} disabled={!inStock} className="flex-1 rounded-full bg-primary py-2.5 text-[13px] font-bold text-white disabled:opacity-40">{added ? "Added ✓" : inStock ? "Add to cart" : "Sold out"}</button>
          <button onClick={() => { if (addToCart()) router.push("/checkout"); }} disabled={!inStock} className="rounded-full bg-accent px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40">Buy</button>
        </div>
      </div>

      <Reviews product={product} />

      {related.length > 0 && (
        <section className="mt-8 sm:mt-16">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-base font-black text-ink sm:text-xl">Similar products</h2>
            {product.category && <Link href={`/categories/${encodeURIComponent(product.category)}`} className="text-sm font-semibold text-primary hover:underline">View all {product.category} →</Link>}
          </div>
          <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
            {related.map((r) => <div key={r.id} className="w-40 shrink-0 sm:w-auto"><ProductCard product={r} /></div>)}
          </div>
        </section>
      )}
    </div>
  );
}
