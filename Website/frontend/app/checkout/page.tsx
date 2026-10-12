"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, cedi, type Branch, type Order, type Quote } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { EmptyState } from "@/components/ui";
import { PhoneInput } from "@/components/form";

const PAYMENT_METHODS = [
  { id: "MOBILE_MONEY", label: "Mobile Money", desc: "MTN MoMo, Telecel Cash, AirtelTigo, we'll send payment details after you order" },
  { id: "CASH_ON_DELIVERY", label: "Cash on Delivery / Pickup", desc: "Pay when you receive your order" },
  { id: "BANK_TRANSFER", label: "Bank Transfer", desc: "We'll share account details after ordering" },
];

const input = "h-11 w-full rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-primary";
const label = "mb-1.5 block text-xs font-semibold text-muted";

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, subtotal, clear } = useCart();
  const { user, token } = useAuth();
  const settings = useSettings();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [fulfilment, setFulfilment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [payment, setPayment] = useState("MOBILE_MONEY");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const submitting = useRef(false);

  useEffect(() => { api.branches().then(setBranches).catch(() => {}); }, []);

  useEffect(() => {
    if (user) {
      setName(user.full_name);
      setEmail(user.email);
      setPhone(user.phone);
      if (user.address) setAddress((a) => a || user.address!);
    }
  }, [user]);

  // Server-calculated totals (coupon + shipping rules), the single source of truth.
  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    api.quote({ subtotal, fulfilment_type: fulfilment, coupon_code: coupon || undefined })
      .then((q) => { if (!cancelled) { setQuote(q); if (coupon && !q.coupon_code) { setCoupon(null); setCouponMsg({ ok: false, text: q.coupon_message || "Coupon removed" }); } } })
      .catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [subtotal, fulfilment, coupon, lines.length]);

  const fallbackShipping = fulfilment === "PICKUP" ? 0 : parseFloat(settings.default_shipping_fee || "0");
  const shipping = quote ? parseFloat(quote.shipping_fee) : fallbackShipping;
  const discount = quote ? parseFloat(quote.discount) : 0;
  const total = quote ? parseFloat(quote.total) : subtotal + shipping;
  const threshold = settings.free_shipping_threshold ? parseFloat(settings.free_shipping_threshold) : null;
  const toFree = useMemo(
    () => (fulfilment === "DELIVERY" && threshold && subtotal - discount < threshold ? threshold - (subtotal - discount) : 0),
    [fulfilment, threshold, subtotal, discount]
  );

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponMsg(null);
    try {
      const q = await api.quote({ subtotal, fulfilment_type: fulfilment, coupon_code: code });
      if (q.coupon_code) { setCoupon(q.coupon_code); setCouponMsg({ ok: true, text: q.coupon_message || "Coupon applied" }); setCouponInput(""); }
      else setCouponMsg({ ok: false, text: q.coupon_message || "This coupon isn't valid" });
    } catch (e) { setCouponMsg({ ok: false, text: e instanceof Error ? e.message : "Could not check coupon" }); }
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return; // guards double-clicks / double-submits
    setError(null);
    if (phone.length < 13) { setError("Enter a valid phone number, 9 digits after +233."); return; }
    if (fulfilment === "PICKUP" && !branchId) { setError("Please choose a pickup branch."); return; }
    if (fulfilment === "DELIVERY" && !address.trim()) { setError("Please enter a delivery address."); return; }
    if (!agree) { setError("Please accept the terms to continue."); return; }

    submitting.current = true;
    setPlacing(true);
    try {
      const order: Order = await api.checkout(
        {
          items: lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity, option_label: l.optionLabel ?? undefined })),
          guest_name: name.trim(), guest_email: email.trim(), guest_phone: phone,
          guest_address: address.trim() || undefined,
          fulfilment_type: fulfilment,
          branch_id: fulfilment === "PICKUP" ? branchId! : undefined,
          payment_method: payment,
          coupon_code: coupon || undefined,
          notes: notes.trim() || undefined,
        },
        token
      );
      try { sessionStorage.setItem("mj_last_order", JSON.stringify(order)); } catch {}
      clear();
      router.push(`/checkout/confirmation?order=${order.order_number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place order. Please try again.");
      submitting.current = false;
      setPlacing(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-16 sm:px-6">
        <EmptyState title="Your cart is empty" hint="Add products before checking out." actionHref="/products" actionLabel="Shop products" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-10">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Checkout</h1>
      {!user && (
        <p className="mt-2 text-sm text-muted">
          Checking out as a guest.{" "}
          <Link href="/login?next=/checkout" className="font-semibold text-primary hover:underline">Sign in</Link>{" "}
          for faster checkout and order history.
        </p>
      )}

      <form onSubmit={placeOrder} className="mt-4 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
            <h2 className="mb-4 text-base font-bold text-ink">Contact Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label} htmlFor="c-name">Full name *</label><input id="c-name" required minLength={2} maxLength={128} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" autoComplete="name" className={input} /></div>
              <div><label className={label}>Phone *</label><PhoneInput required value={phone} onChange={setPhone} placeholder="Enter phone number" /></div>
              <div className="sm:col-span-2"><label className={label} htmlFor="c-email">Email *</label><input id="c-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Order updates are sent here" autoComplete="email" className={input} /></div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
            <h2 className="mb-4 text-base font-bold text-ink">Delivery Method</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["DELIVERY", "PICKUP"] as const).map((f) => (
                <button type="button" key={f} onClick={() => setFulfilment(f)} aria-pressed={fulfilment === f}
                  className={`rounded-xl border p-4 text-left transition ${fulfilment === f ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <span className="block text-sm font-bold text-ink">{f === "DELIVERY" ? "Delivery" : "Branch Pickup"}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {f === "DELIVERY"
                      ? (threshold ? `${cedi(parseFloat(settings.default_shipping_fee || "0"))} fee · free over ${cedi(threshold)}` : `We deliver to your address (${cedi(parseFloat(settings.default_shipping_fee || "0"))} fee)`)
                      : "Collect from a branch, free"}
                  </span>
                </button>
              ))}
            </div>

            {fulfilment === "DELIVERY" ? (
              <div className="mt-4">
                <label className={label} htmlFor="c-addr">Delivery address *</label>
                <textarea id="c-addr" required maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} rows={3} autoComplete="street-address"
                  placeholder="House / landmark, area, city" className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
              </div>
            ) : (
              <div className="mt-4">
                <label className={label}>Pickup branch *</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((b) => (
                    <button type="button" key={b.id} onClick={() => setBranchId(b.id)} aria-pressed={branchId === b.id}
                      className={`rounded-xl border p-3 text-left transition ${branchId === b.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                      <span className="block text-sm font-bold text-ink">{b.name}</span>
                      {b.address && <span className="block text-xs text-muted">{b.address}</span>}
                      {b.phone && <span className="block text-xs text-muted">{b.phone}</span>}
                    </button>
                  ))}
                  {branches.length === 0 && <p className="text-xs text-muted">Loading branches…</p>}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
            <h2 className="mb-4 text-base font-bold text-ink">Payment Method</h2>
            <div className="space-y-2" role="radiogroup">
              {PAYMENT_METHODS.map((m) => (
                <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${payment === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <input type="radio" name="payment" checked={payment === m.id} onChange={() => setPayment(m.id)} className="h-4 w-4 accent-primary" />
                  <span><span className="block text-sm font-bold text-ink">{m.label}</span><span className="block text-xs text-muted">{m.desc}</span></span>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <label className={label} htmlFor="c-notes">Order notes (optional)</label>
              <textarea id="c-notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Any special instructions for your order" className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
            </div>
          </section>
        </div>

        <div className="h-fit rounded-xl border border-border bg-white p-5 lg:sticky lg:top-32">
          <h2 className="text-base font-bold text-ink">Your Order</h2>
          <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
            {lines.map((l) => (
              <div key={l.lineKey} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted">{l.productName}{l.optionLabel ? ` (${l.optionLabel})` : ""} <span className="text-faint">× {l.quantity}</span></span>
                <span className="font-semibold text-ink">{cedi(l.price * l.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {coupon ? (
              <div className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2 text-xs font-semibold text-success">
                <span>Coupon {coupon} applied</span>
                <button type="button" onClick={() => { setCoupon(null); setCouponMsg(null); }} className="underline">Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                  placeholder="Coupon code" aria-label="Coupon code" maxLength={32} className="h-10 min-w-0 flex-1 rounded-full border border-border px-4 text-sm outline-none focus:border-primary" />
                <button type="button" onClick={applyCoupon} disabled={!couponInput.trim()} className="rounded-full border border-primary px-4 text-xs font-bold text-primary hover:bg-primary hover:text-white disabled:opacity-40">Apply</button>
              </div>
            )}
            {couponMsg && <p className={`mt-1.5 text-xs ${couponMsg.ok ? "text-success" : "text-error"}`}>{couponMsg.text}</p>}
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span className="font-semibold text-ink">{cedi(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-success"><span>Discount</span><span className="font-semibold">−{cedi(discount)}</span></div>}
            <div className="flex justify-between text-muted"><span>{fulfilment === "PICKUP" ? "Pickup" : "Delivery"}</span><span className="font-semibold text-ink">{shipping === 0 ? "Free" : cedi(shipping)}</span></div>
            {toFree > 0 && <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">Add {cedi(toFree)} more for <span className="font-semibold text-ink">free delivery</span>.</p>}
          </div>
          <div className="mt-4 flex justify-between border-t border-border pt-4">
            <span className="font-bold text-ink">Total</span>
            <span className="text-lg font-black text-primary">{cedi(total)}</span>
          </div>

          <label className="mt-4 flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>I agree to the <Link href="/terms" target="_blank" className="font-semibold text-primary hover:underline">terms</Link> and <Link href="/shipping-returns" target="_blank" className="font-semibold text-primary hover:underline">shipping &amp; returns policy</Link>.</span>
          </label>

          {error && <p role="alert" className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{error}</p>}
          <button type="submit" disabled={placing} className="mt-4 w-full rounded-full bg-accent py-3 text-sm font-bold text-white transition hover:bg-accent/90 disabled:opacity-50">
            {placing ? "Placing order…" : `Place Order, ${cedi(total)}`}
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
            You won&apos;t be charged online. Our team confirms your order and arranges payment using your chosen method.
          </p>
        </div>
      </form>
    </div>
  );
}
