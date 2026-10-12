"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { PhoneInput } from "@/components/form";
import FindUs from "@/components/FindUs";

const input = "h-11 w-full rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-primary";
const label = "mb-1.5 block text-xs font-semibold text-muted";

export default function ContactPage() {
  const s = useSettings();
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.contact({ name: form.name, email: form.email, phone: form.phone.length > 4 ? form.phone : undefined, message: form.message, website: form.website });
      setSent(true);
      setForm({ name: "", email: "", phone: "", message: "", website: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-7 sm:py-12 sm:px-6">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Contact Us</h1>
      <p className="mt-1 text-sm text-muted">Questions about products, orders or pricing, we&apos;re happy to help.</p>

      <div className="mt-6 sm:mt-10 grid gap-8 md:grid-cols-[1fr_320px]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label}>Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter your name" autoComplete="name" className={input} /></div>
            <div><label className={label}>Phone</label><PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="Enter phone number" /></div>
          </div>
          <div><label className={label}>Email *</label><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter your email address" autoComplete="email" className={input} /></div>
          <div>
            <label className={label}>Message *</label>
            <textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Enter your message"
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
          </div>
          {/* honeypot: hidden from people, bots fill it in */}
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="absolute left-[-9999px] h-0 w-0 opacity-0" />
          {sent && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">Thank you, your message has been sent. We&apos;ll get back to you shortly.</p>}
          {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">
            {busy ? "Sending…" : "Send Message"}
          </button>
        </form>

        <div className="space-y-4">
          {s?.contact_phone && (
            <a href={`tel:${s.contact_phone.replace(/\s/g, "")}`} className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 transition hover:border-primary/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              </span>
              <span><span className="block text-xs font-semibold text-muted">Call us</span><span className="block text-sm font-bold text-ink">{s.contact_phone}</span></span>
            </a>
          )}
          {s?.contact_email && (
            <a href={`mailto:${s.contact_email}`} className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 transition hover:border-primary/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
              </span>
              <span><span className="block text-xs font-semibold text-muted">Email</span><span className="block text-sm font-bold text-ink">{s.contact_email}</span></span>
            </a>
          )}
          {s?.contact_address && (
            <div className="flex items-center gap-4 rounded-xl border border-border bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              </span>
              <span><span className="block text-xs font-semibold text-muted">Head office</span><span className="block text-sm font-bold text-ink">{s.contact_address}</span></span>
            </div>
          )}
        </div>
      </div>

      <FindUs className="mt-8 sm:mt-10" />
    </div>
  );
}
