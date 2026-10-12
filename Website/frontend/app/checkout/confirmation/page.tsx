"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, cedi, PAYMENT_LABELS, type Order } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner, StatusBadge } from "@/components/ui";

function ConfirmationInner() {
  const params = useSearchParams();
  const { token, loading: authLoading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    const orderNumber = params.get("order");

    async function load() {
      // 1. Signed-in customers: fetch from the API (works on refresh / direct links).
      if (token && orderNumber) {
        try {
          setOrder(await api.myOrderByNumber(orderNumber, token));
          setLoading(false);
          return;
        } catch { /* fall through */ }
      }
      // 2. Guests: the snapshot saved right after checkout.
      try {
        const raw = sessionStorage.getItem("mj_last_order");
        if (raw) {
          const o: Order = JSON.parse(raw);
          if (!orderNumber || o.order_number === orderNumber) setOrder(o);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [params, token, authLoading]);

  if (loading || authLoading) return <Spinner label="Loading your order…" />;

  if (!order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-7 sm:py-20 text-center">
        <h1 className="text-2xl font-black text-ink">We couldn&apos;t load that order here</h1>
        <p className="mt-2 text-sm text-muted">Use the order number from your confirmation email to check its status.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/track" className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Track an order</Link>
          <Link href="/products" className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-ink hover:bg-surface">Continue Shopping</Link>
        </div>
      </div>
    );
  }

  const discount = parseFloat(order.discount_amount || "0");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-16 sm:px-6">
      <div className="rounded-2xl border border-border bg-white p-5 sm:p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
          <svg className="h-7 w-7 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <h1 className="mt-5 text-2xl font-black text-ink">Thank you for your order!</h1>
        <p className="mt-2 text-sm text-muted">
          Order <span className="font-bold text-ink">{order.order_number}</span> has been received. Keep this number, you can track it any time.
        </p>
        <div className="mt-2"><StatusBadge status={order.status} /></div>

        <div className="mt-5 sm:mt-8 space-y-2 rounded-xl bg-surface p-5 text-left text-sm">
          {order.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-muted">
                {i.product_name}, {i.variant_name}{i.option_label ? ` (${i.option_label})` : ""} <span className="text-faint">× {parseFloat(i.quantity)}</span>
              </span>
              <span className="font-semibold text-ink">{cedi(i.line_total)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-muted"><span>Subtotal</span><span className="font-semibold text-ink">{cedi(order.subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-success"><span>Discount ({order.coupon_code})</span><span className="font-semibold">−{cedi(discount)}</span></div>}
          <div className="flex justify-between text-muted">
            <span>{order.fulfilment_type === "PICKUP" ? "Pickup" : "Delivery"}</span>
            <span className="font-semibold text-ink">{parseFloat(order.shipping_fee) === 0 ? "Free" : cedi(order.shipping_fee)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="font-bold text-ink">Total</span><span className="text-base font-black text-primary">{cedi(order.total)}</span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border p-4 text-left text-xs leading-relaxed text-muted">
          <p><span className="font-semibold text-ink">Fulfilment:</span> {order.fulfilment_type === "PICKUP" ? "Branch pickup" : "Delivery"}</p>
          <p className="mt-1"><span className="font-semibold text-ink">Payment:</span> {PAYMENT_LABELS[order.payment_method] || order.payment_method}, {order.payment_status}</p>
          {order.payment_method !== "CASH_ON_DELIVERY" && (
            <p className="mt-2 rounded-lg bg-surface px-3 py-2">
              We&apos;ll contact you shortly with payment details and confirm your order once payment is received.
            </p>
          )}
        </div>

        <div className="mt-5 sm:mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/products" className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Continue Shopping</Link>
          <Link href={token ? "/account" : `/track?order=${order.order_number}`} className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-ink hover:bg-surface">Track this order</Link>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<Spinner label="Loading your order…" />}>
      <ConfirmationInner />
    </Suspense>
  );
}
