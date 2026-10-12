"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, cedi, fmtDateTime, PAYMENT_LABELS, type Order } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Spinner, StatusBadge, ErrorBox } from "@/components/ui";
import { OrderProgress } from "@/app/track/TrackClient";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, loading } = useAuth();
  const { add } = useCart();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !token) router.replace(`/login?next=/account/orders/${id}`);
  }, [loading, token, id, router]);

  useEffect(() => {
    if (!token) return;
    api.myOrder(id, token).then(setOrder).catch((e) => setError(e.message)).finally(() => setFetching(false));
    // status changes made by the store show up here without a refresh
    const t = setInterval(() => {
      if (document.visibilityState === "visible") api.myOrder(id, token).then(setOrder).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [id, token]);

  async function cancel() {
    if (!token || !order || !confirm("Cancel this order? Reserved items go back into stock.")) return;
    setBusy(true); setNote(null);
    try { setOrder(await api.cancelOrder(order.id, token)); }
    catch (e) { setNote(e instanceof Error ? e.message : "Could not cancel"); }
    finally { setBusy(false); }
  }

  /** Re-add every still-available item to the cart at current prices. */
  async function reorder() {
    if (!order) return;
    setBusy(true); setNote(null);
    let added = 0;
    try {
      const seen = new Set<number>();
      for (const item of order.items) {
        const prods = await api.products({ q: item.sku });
        const hit = prods.find((p) => p.variants.some((v) => v.id === item.variant_id));
        const v = hit?.variants.find((x) => x.id === item.variant_id);
        if (!hit || !v || seen.has(v.id + (item.option_label ? 1e9 : 0))) continue;
        const stock = Math.floor(parseFloat(v.available_quantity));
        if (stock <= 0) continue;
        add({
          variantId: v.id, productId: hit.id, productName: hit.name, variantName: v.variant_name,
          optionLabel: item.option_label, sku: v.sku, unit: v.unit, price: parseFloat(v.selling_price),
          image: item.image_url || hit.image_url, maxQuantity: stock,
        }, Math.min(parseFloat(item.quantity), stock));
        added++;
      }
    } catch { /* handled below */ }
    setBusy(false);
    if (added) router.push("/cart");
    else setNote("Those items are no longer available online.");
  }

  if (loading || fetching) return <Spinner label="Loading order…" />;
  if (error || !order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-16">
        <ErrorBox message={error || "Order not found"} />
        <div className="mt-4 text-center"><Link href="/account" className="text-sm font-semibold text-primary hover:underline">← Back to account</Link></div>
      </div>
    );
  }
  const discount = parseFloat(order.discount_amount || "0");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10 sm:px-6">
      <Link href="/account" className="text-sm font-semibold text-primary hover:underline">← Back to orders</Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">{order.order_number}</h1>
          <p className="mt-0.5 text-sm text-muted">Placed {fmtDateTime(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <OrderProgress order={order} />

      <div className="mt-5 sm:mt-8 rounded-xl border border-border bg-white">
        <div className="border-b border-border px-5 py-4"><h2 className="text-base font-bold text-ink">Items</h2></div>
        <ul className="divide-y divide-border">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{i.product_name}</p>
                <p className="text-xs text-muted">{i.variant_name} · {i.sku} · × {parseFloat(i.quantity)}</p>
                {i.option_label && <p className="text-xs font-semibold text-accent">Option: {i.option_label}</p>}
              </div>
              <span className="font-bold text-ink">{cedi(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5 border-t border-border px-5 py-4 text-sm">
          <div className="flex justify-between text-muted"><span>Subtotal</span><span>{cedi(order.subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-success"><span>Discount ({order.coupon_code})</span><span>−{cedi(discount)}</span></div>}
          <div className="flex justify-between text-muted"><span>{order.fulfilment_type === "PICKUP" ? "Pickup" : "Delivery"}</span><span>{parseFloat(order.shipping_fee) === 0 ? "Free" : cedi(order.shipping_fee)}</span></div>
          <div className="flex justify-between border-t border-border pt-2"><span className="font-bold text-ink">Total</span><span className="font-black text-primary">{cedi(order.total)}</span></div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-5 text-sm">
          <h3 className="font-bold text-ink">Fulfilment</h3>
          <p className="mt-2 text-muted">{order.fulfilment_type === "PICKUP" ? "Branch pickup" : "Delivery"}</p>
          {order.guest_address && <p className="mt-1 text-muted">{order.guest_address}</p>}
        </div>
        <div className="rounded-xl border border-border bg-white p-5 text-sm">
          <h3 className="font-bold text-ink">Payment</h3>
          <p className="mt-2 text-muted">{PAYMENT_LABELS[order.payment_method] || order.payment_method}</p>
          <p className="text-muted">Status: <span className="font-semibold text-ink">{order.payment_status}</span></p>
          {order.payment_reference && <p className="text-xs text-faint">Ref: {order.payment_reference}</p>}
        </div>
      </div>

      {note && <p role="alert" className="mt-4 rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{note}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={reorder} disabled={busy} className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">Order again</button>
        {(order.status === "PENDING" || order.status === "CONFIRMED") && (
          <button onClick={cancel} disabled={busy} className="rounded-full border border-error/40 px-6 py-2.5 text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-50">Cancel order</button>
        )}
      </div>
    </div>
  );
}
