"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, cedi, fmtDateTime, PAYMENT_LABELS, type Order } from "@/lib/api";
import { StatusBadge } from "@/components/ui";

const STEPS = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
const input = "h-11 w-full rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-primary";

export function OrderProgress({ order }: { order: Order }) {
  const idx = order.status === "CANCELLED" ? -1 : STEPS.indexOf(order.status);
  const shippedLabel = order.fulfilment_type === "PICKUP" ? "READY" : "SHIPPED";
  if (order.status === "CANCELLED") {
    return (
      <p className="mt-6 rounded-xl bg-error/10 px-4 py-3 text-sm font-medium text-error">
        This order was cancelled{order.cancel_reason ? `, ${order.cancel_reason}` : ""}.
        {order.payment_status === "REFUNDED" && " Your payment is marked as refunded."}
      </p>
    );
  }
  return (
    <ol className="mt-5 sm:mt-8 flex items-center" aria-label="Order progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 items-center last:flex-none" aria-current={i === idx ? "step" : undefined}>
          <div className="flex flex-col items-center">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${i <= idx ? "bg-primary text-white" : "border-2 border-border bg-white text-faint"}`}>{i < idx ? "✓" : i + 1}</div>
            <span className={`mt-1.5 text-[10px] font-semibold ${i <= idx ? "text-primary" : "text-faint"}`}>{s === "SHIPPED" ? shippedLabel : s}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`mx-1 mb-5 h-0.5 flex-1 ${i < idx ? "bg-primary" : "bg-border"}`} />}
        </li>
      ))}
    </ol>
  );
}

function Inner() {
  const params = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get("order") || "");
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const last = JSON.parse(sessionStorage.getItem("mj_last_order") || "null") as Order | null;
      if (last && !orderNumber) setOrderNumber(last.order_number);
      if (last && last.order_number === (params.get("order") || last.order_number) && (last.guest_email || last.guest_phone)) setContact(last.guest_email || last.guest_phone || "");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setOrder(null);
    try { setOrder(await api.trackOrder({ order_number: orderNumber.trim(), contact: contact.trim() })); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not find that order"); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-7 sm:py-12 sm:px-6">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Track your order</h1>
      <p className="mt-1 text-sm text-muted">Enter your order number and the email address or phone number you used at checkout. Signed-in customers can also see orders in <Link href="/account" className="font-semibold text-primary hover:underline">My Account</Link>.</p>

      <form onSubmit={submit} className="mt-5 sm:mt-8 space-y-4 rounded-2xl border border-border bg-white p-6">
        <div>
          <label htmlFor="t-num" className="mb-1.5 block text-xs font-semibold text-muted">Order number</label>
          <input id="t-num" required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} placeholder="WEB-1A2B3C4D" className={input} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="t-contact" className="mb-1.5 block text-xs font-semibold text-muted">Email or phone number</label>
          <input id="t-contact" required value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com or 024 000 0000" className={input} autoComplete="off" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{error}</p>}
        <button disabled={busy} className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">{busy ? "Checking…" : "Track order"}</button>
      </form>

      {order && (
        <div className="mt-5 sm:mt-8 rounded-2xl border border-border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-black text-ink">{order.order_number}</h2><p className="text-xs text-muted">Placed {fmtDateTime(order.created_at)}</p></div>
            <StatusBadge status={order.status} />
          </div>
          <OrderProgress order={order} />
          <ul className="mt-6 divide-y divide-border text-sm">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2.5">
                <span className="min-w-0 text-muted"><span className="font-semibold text-ink">{i.product_name}</span>, {i.variant_name}{i.option_label ? ` (${i.option_label})` : ""} × {parseFloat(i.quantity)}</span>
                <span className="font-semibold text-ink">{cedi(i.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            {parseFloat(order.discount_amount || "0") > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>−{cedi(order.discount_amount!)}</span></div>}
            <div className="flex justify-between text-muted"><span>{order.fulfilment_type === "PICKUP" ? "Pickup" : "Delivery"}</span><span>{parseFloat(order.shipping_fee) === 0 ? "Free" : cedi(order.shipping_fee)}</span></div>
            <div className="flex justify-between"><span className="font-bold text-ink">Total</span><span className="font-black text-primary">{cedi(order.total)}</span></div>
          </div>
          <p className="mt-4 text-xs text-muted">Payment: {PAYMENT_LABELS[order.payment_method] || order.payment_method}, <span className="font-semibold text-ink">{order.payment_status}</span></p>
        </div>
      )}
    </div>
  );
}

export default function TrackClient() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
