"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { fmt12 } from "@/lib/website-helpers";
import {
  websiteApi, WebsiteApiError,
  type WebsiteCoupon, type WebsiteMessage, type WebsiteReview,
} from "@/lib/website-api";

type Tab = "coupons" | "reviews" | "messages";
const box = "w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none";

export default function EngagementPage() {
  const [tab, setTab] = useState<Tab>("coupons");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Coupons, Reviews & Messages" breadcrumb="Website / Engagement" subtitle="Discount codes, customer reviews and contact-form enquiries" />
      <div className="mb-5 flex gap-2">
        {(["coupons", "reviews", "messages"] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setError(null); }}
            className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-[#061161] text-white" : "border border-[#DADDE6] bg-white text-[#0B0E1A] hover:bg-[#FAFAFC]"}`}>{t}</button>
        ))}
      </div>
      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}
      {tab === "coupons" && <Coupons onError={setError} />}
      {tab === "reviews" && <Reviews onError={setError} />}
      {tab === "messages" && <Messages onError={setError} />}
    </div>
  );
}

const errMsg = (e: unknown) => (e instanceof WebsiteApiError ? e.message : "Something went wrong");

function Coupons({ onError }: { onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<WebsiteCoupon[] | null>(null);
  const [f, setF] = useState({ code: "", kind: "PERCENT", value: "", min_order: "0", max_uses: "", expires: "", description: "" });

  const load = useCallback(() => {
    websiteApi<WebsiteCoupon[]>("/api/v1/admin/coupons").then(setRows).catch((e) => { onError(errMsg(e)); setRows([]); });
  }, [onError]);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      await websiteApi("/api/v1/admin/coupons", {
        method: "POST",
        body: {
          code: f.code.trim(), kind: f.kind, value: parseFloat(f.value), min_order: parseFloat(f.min_order) || 0,
          max_uses: f.max_uses ? parseInt(f.max_uses) : null,
          expires_at: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null,
          description: f.description.trim() || null,
        },
      });
      setF({ code: "", kind: "PERCENT", value: "", min_order: "0", max_uses: "", expires: "", description: "" });
      load();
    } catch (err) { onError(errMsg(err)); }
  }

  async function toggle(c: WebsiteCoupon) {
    try { await websiteApi(`/api/v1/admin/coupons/${c.id}`, { method: "PATCH", body: { is_active: !c.is_active } }); load(); }
    catch (err) { onError(errMsg(err)); }
  }
  async function remove(c: WebsiteCoupon) {
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    try { await websiteApi(`/api/v1/admin/coupons/${c.id}`, { method: "DELETE" }); load(); }
    catch (err) { onError(errMsg(err)); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={create} className="h-fit space-y-3 rounded-xl border border-[#DADDE6] bg-white p-5">
        <h3 className="text-sm font-semibold uppercase text-[#4A5060]">New coupon</h3>
        <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="CODE e.g. WELCOME10" className={box} />
        <div className="grid grid-cols-2 gap-2">
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={box}><option value="PERCENT">% off</option><option value="FIXED">GH₵ off</option></select>
          <input required type="number" min="0.01" step="0.01" max={f.kind === "PERCENT" ? 100 : undefined} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Value" className={box} />
        </div>
        <input type="number" min="0" step="0.01" value={f.min_order} onChange={(e) => setF({ ...f, min_order: e.target.value })} placeholder="Minimum order (GH₵)" className={box} />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min="1" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} placeholder="Max uses (blank = ∞)" className={box} />
          <input type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} className={box} title="Expiry date" />
        </div>
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Note (internal)" className={box} />
        <button className="w-full rounded-xl bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C]">Create coupon</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[#DADDE6] bg-white lg:col-span-2">
        {rows === null ? <p className="p-8 text-center text-sm text-[#6B7183]">Loading…</p> : rows.length === 0 ? <p className="p-8 text-center text-sm text-[#6B7183]">No coupons yet.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]"><tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Discount</th><th className="px-4 py-2">Used</th><th className="px-4 py-2">Expires</th><th className="px-4 py-2">Status</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                return (
                  <tr key={c.id} className="border-t border-[#DADDE6]">
                    <td className="px-4 py-2 font-mono font-semibold text-[#061161]">{c.code}<div className="font-sans text-[11px] font-normal text-[#6B7183]">{c.description}</div></td>
                    <td className="px-4 py-2">{c.kind === "PERCENT" ? `${parseFloat(c.value)}%` : `GH₵${parseFloat(c.value).toFixed(2)}`}{parseFloat(c.min_order) > 0 && <div className="text-[11px] text-[#6B7183]">min GH₵{parseFloat(c.min_order).toFixed(2)}</div>}</td>
                    <td className="px-4 py-2">{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                    <td className="px-4 py-2 text-[#4A5060]">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${!c.is_active || expired ? "bg-[#6B7183]/10 text-[#4A5060]" : "bg-[#16803C]/10 text-[#16803C]"}`}>{!c.is_active ? "Off" : expired ? "Expired" : "Active"}</span></td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button onClick={() => toggle(c)} className="mr-3 text-xs font-semibold text-[#061161] hover:underline">{c.is_active ? "Disable" : "Enable"}</button>
                      <button onClick={() => remove(c)} className="text-xs font-semibold text-[#C62828] hover:underline">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Reviews({ onError }: { onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<WebsiteReview[] | null>(null);
  const load = useCallback(() => {
    websiteApi<WebsiteReview[]>("/api/v1/admin/reviews").then(setRows).catch((e) => { onError(errMsg(e)); setRows([]); });
  }, [onError]);
  useEffect(load, [load]);

  async function setVisible(r: WebsiteReview, v: boolean) {
    try { await websiteApi(`/api/v1/admin/reviews/${r.id}`, { method: "PATCH", body: { is_visible: v } }); load(); } catch (e) { onError(errMsg(e)); }
  }
  async function remove(r: WebsiteReview) {
    if (!confirm("Delete this review permanently?")) return;
    try { await websiteApi(`/api/v1/admin/reviews/${r.id}`, { method: "DELETE" }); load(); } catch (e) { onError(errMsg(e)); }
  }

  if (rows === null) return <p className="text-sm text-[#6B7183]">Loading…</p>;
  if (rows.length === 0) return <p className="rounded-xl border border-[#DADDE6] bg-white p-8 text-center text-sm text-[#6B7183]">No reviews yet. Verified buyers can review products once an order is delivered.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className={`rounded-xl border bg-white p-4 ${r.is_visible ? "border-[#DADDE6]" : "border-[#DADDE6] opacity-60"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm"><span className="font-semibold text-[#0B0E1A]">{r.product_name ?? `Product #${r.product_id}`}</span> <span className="text-[#B7791F]">{"★".repeat(r.rating)}<span className="text-[#DADDE6]">{"★".repeat(5 - r.rating)}</span></span></div>
            <div className="text-xs text-[#6B7183]">{r.author_name} · {fmt12(r.created_at)}</div>
          </div>
          {r.title && <p className="mt-1 text-sm font-semibold">{r.title}</p>}
          {r.body && <p className="mt-1 whitespace-pre-line text-sm text-[#4A5060]">{r.body}</p>}
          <div className="mt-2 flex gap-4 text-xs font-semibold">
            <button onClick={() => setVisible(r, !r.is_visible)} className="text-[#061161] hover:underline">{r.is_visible ? "Hide from website" : "Show on website"}</button>
            <button onClick={() => remove(r)} className="text-[#C62828] hover:underline">Delete</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Messages({ onError }: { onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<WebsiteMessage[] | null>(null);
  const load = useCallback(() => {
    websiteApi<WebsiteMessage[]>("/api/v1/admin/messages").then(setRows).catch((e) => { onError(errMsg(e)); setRows([]); });
  }, [onError]);
  useEffect(load, [load]);

  async function mark(m: WebsiteMessage, handled: boolean) {
    try { await websiteApi(`/api/v1/admin/messages/${m.id}`, { method: "PATCH", body: { is_handled: handled } }); load(); } catch (e) { onError(errMsg(e)); }
  }

  if (rows === null) return <p className="text-sm text-[#6B7183]">Loading…</p>;
  if (rows.length === 0) return <p className="rounded-xl border border-[#DADDE6] bg-white p-8 text-center text-sm text-[#6B7183]">No messages yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((m) => (
        <li key={m.id} className={`rounded-xl border bg-white p-4 ${m.is_handled ? "border-[#DADDE6] opacity-70" : "border-[#B7791F]/40"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm"><span className="font-semibold text-[#0B0E1A]">{m.name}</span> <a href={`mailto:${m.email}`} className="text-[#061161] hover:underline">{m.email}</a>{m.phone && <> · <a href={`tel:${m.phone}`} className="text-[#4A5060]">{m.phone}</a></>}</div>
            <div className="text-xs text-[#6B7183]">{fmt12(m.created_at)}</div>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-[#0B0E1A]">{m.message}</p>
          <button onClick={() => mark(m, !m.is_handled)} className="mt-2 text-xs font-semibold text-[#061161] hover:underline">{m.is_handled ? "Mark as unread" : "Mark as handled"}</button>
        </li>
      ))}
    </ul>
  );
}
