"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, cedi, type CatalogProduct } from "@/lib/api";
import { useCart, type CartLine } from "@/lib/cart";
import { ProductCard, ProductImage, EmptyState } from "@/components/ui";

export default function CartPage() {
  const { lines, setQty: rawSetQty, remove, add, subtotal, count } = useCart();
  const [similar, setSimilar] = useState<CatalogProduct[]>([]);
  const [confirming, setConfirming] = useState<CartLine | null>(null);
  const [undo, setUndo] = useState<CartLine | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Toasts disappear on their own.
  useEffect(() => {
    if (!undo && !notice) return;
    const t = setTimeout(() => { setUndo(null); setNotice(null); }, 6000);
    return () => clearTimeout(t);
  }, [undo, notice]);

  /** Quantity changes: going below 1 asks before removing; going past stock explains why not. */
  function setQty(lineKey: string, qty: number) {
    const line = lines.find((l) => l.lineKey === lineKey);
    if (!line) return;
    if (qty < 1) { setConfirming(line); return; }
    if (line.maxQuantity > 0 && qty > line.maxQuantity) {
      setNotice(`Only ${line.maxQuantity} of “${line.productName}” ${line.maxQuantity === 1 ? "is" : "are"} in stock.`);
      return;
    }
    setNotice(null);
    rawSetQty(lineKey, qty);
  }
  const askRemove = (lineKey: string) => { const l = lines.find((x) => x.lineKey === lineKey); if (l) setConfirming(l); };
  function confirmRemove() {
    if (!confirming) return;
    remove(confirming.lineKey);
    setUndo(confirming);
    setConfirming(null);
  }
  function undoRemove() {
    if (!undo) return;
    const { lineKey: _k, quantity, ...rest } = undo; // eslint-disable-line @typescript-eslint/no-unused-vars
    add(rest, quantity);
    setUndo(null);
  }

  // "You may also like": similar products to the first few items in the cart.
  const key = lines.slice(0, 3).map((l) => l.productId).join(",");
  useEffect(() => {
    if (!key) { setSimilar([]); return; }
    let cancelled = false;
    const inCart = new Set(lines.map((l) => l.productId));
    Promise.all(key.split(",").map((id) => api.related(id, 6).catch(() => [] as CatalogProduct[]))).then((res) => {
      if (cancelled) return;
      const seen = new Set<number>();
      const out: CatalogProduct[] = [];
      for (const p of res.flat()) if (!inCart.has(p.id) && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
      setSimilar(out.slice(0, 8));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toasts = (
    <>
      {(undo || notice) && (
        <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-[8.5rem] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-[13px] text-white shadow-xl lg:bottom-6">
          <span className="min-w-0 flex-1">{undo ? <>Removed <b className="font-semibold">{undo.productName}</b> from your cart.</> : notice}</span>
          {undo && <button onClick={undoRemove} className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25">Undo</button>}
        </div>
      )}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="rm-title" onClick={() => setConfirming(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="rm-title" className="text-base font-black text-ink">Remove this item?</h2>
            <p className="mt-1.5 text-sm text-muted">
              Quantity can&apos;t go below 1. Do you want to remove <b className="font-semibold text-ink">{confirming.productName}</b>
              {confirming.optionLabel ? ` (${confirming.optionLabel})` : ""} from your cart?
            </p>
            <div className="mt-5 flex gap-2">
              <button autoFocus onClick={() => setConfirming(null)} className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold text-ink hover:bg-surface">Keep item</button>
              <button onClick={confirmRemove} className="flex-1 rounded-full bg-error py-2.5 text-sm font-bold text-white hover:bg-error/90">Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="mb-5 text-2xl font-black text-ink sm:mb-8 sm:text-3xl">Your Cart</h1>
        <EmptyState title="Your cart is empty" hint="Browse our catalog and add products to get started." actionHref="/products" actionLabel="Shop products" />
        {toasts}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 pb-28 sm:px-6 sm:py-10 lg:pb-10">
      <h1 className="text-xl font-black text-ink sm:text-3xl">Your Cart</h1>
      <p className="mt-0.5 text-xs text-muted sm:text-sm">{count} item{count !== 1 ? "s" : ""}</p>

      <div className="mt-4 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-border rounded-xl border border-border bg-white">
          {lines.map((l) => (
            <li key={l.lineKey} className="flex gap-3 p-3 sm:items-center sm:gap-4 sm:p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                <ProductImage src={l.image} alt={l.productName} className="h-full w-full" width={200} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/products/${l.productId}`} className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink hover:text-primary sm:text-sm">{l.productName}</Link>
                  <button onClick={() => askRemove(l.lineKey)} className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-faint hover:bg-error/10 hover:text-error sm:hidden" aria-label={`Remove ${l.productName}`}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  </button>
                </div>
                <p className="truncate text-[11px] text-muted sm:text-xs">{l.variantName} · {l.sku}</p>
                {l.optionLabel && <p className="text-[11px] font-semibold text-accent sm:text-xs">Option: {l.optionLabel}</p>}
                <p className="mt-0.5 text-[13px] font-bold text-primary sm:text-sm">{cedi(l.price)} <span className="text-[11px] font-normal text-faint">/ {l.unit}</span></p>
                <div className="mt-2 flex items-center justify-between sm:hidden">
                  <QtyStepper l={l} setQty={setQty} />
                  <span className="text-sm font-bold text-ink">{cedi(l.price * l.quantity)}</span>
                </div>
              </div>
              <div className="hidden items-center gap-4 sm:flex">
                <QtyStepper l={l} setQty={setQty} />
                <div className="w-24 text-right text-sm font-bold text-ink">{cedi(l.price * l.quantity)}</div>
                <button onClick={() => askRemove(l.lineKey)} className="rounded-full p-1.5 text-faint hover:bg-error/10 hover:text-error" aria-label={`Remove ${l.productName}`}>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden h-fit rounded-xl border border-border bg-white p-5 lg:block">
          <h2 className="text-base font-bold text-ink">Order Summary</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span className="font-semibold text-ink">{cedi(subtotal)}</span></div>
            <div className="flex justify-between text-muted"><span>Delivery</span><span className="text-xs">Calculated at checkout</span></div>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex justify-between"><span className="text-sm font-bold text-ink">Total</span><span className="text-lg font-black text-primary">{cedi(subtotal)}</span></div>
          </div>
          <Link href="/checkout" className="mt-5 block rounded-full bg-primary py-3 text-center text-sm font-bold text-white transition hover:bg-primary-hover">Proceed to Checkout</Link>
          <Link href="/products" className="mt-2 block rounded-full border border-border py-3 text-center text-sm font-semibold text-ink hover:bg-surface">Continue Shopping</Link>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-8 sm:mt-12" aria-labelledby="alsolike">
          <h2 id="alsolike" className="mb-3 text-base font-black text-ink sm:mb-5 sm:text-xl">You may also like</h2>
          <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
            {similar.map((p) => <div key={p.id} className="w-40 shrink-0 sm:w-auto"><ProductCard product={p} /></div>)}
          </div>
        </section>
      )}

      {toasts}

      {/* Mobile checkout bar (sits above the bottom navigation) */}
      <div className="fixed inset-x-0 bottom-[3.6rem] z-30 border-t border-border bg-white px-3 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,.06)] lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="leading-tight"><p className="text-[11px] text-muted">Subtotal</p><p className="text-base font-black text-primary">{cedi(subtotal)}</p></div>
          <Link href="/checkout" className="ml-auto rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white">Checkout</Link>
        </div>
      </div>
    </div>
  );
}

function QtyStepper({ l, setQty }: { l: { lineKey: string; quantity: number; maxQuantity: number }; setQty: (k: string, q: number) => void }) {
  return (
    <div className="flex items-center rounded-full border border-border">
      <button onClick={() => setQty(l.lineKey, l.quantity - 1)} className="h-8 w-8 font-bold text-muted hover:text-ink" aria-label="Decrease quantity">−</button>
      <span className="w-7 text-center text-xs font-bold" aria-live="polite">{l.quantity}</span>
      <button onClick={() => setQty(l.lineKey, l.quantity + 1)} className="h-8 w-8 font-bold text-muted hover:text-ink" aria-label="Increase quantity">+</button>
    </div>
  );
}
