"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, cedi, fmtDate, type OrderListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PhoneInput } from "@/components/form";
import { Spinner, StatusBadge, EmptyState } from "@/components/ui";

const input = "h-11 w-full rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-primary";
const label = "mb-1.5 block text-xs font-semibold text-muted";

export default function AccountPage() {
  const { user, token, loading, logout, login, refresh } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [tab, setTab] = useState<"profile" | "password">("profile");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace("/login?next=/account"); }, [loading, user, router]);
  useEffect(() => {
    if (!token) return;
    api.myOrders(token).then(setOrders).catch(() => {}).finally(() => setOrdersLoading(false));
  }, [token]);
  useEffect(() => { if (user) setForm({ full_name: user.full_name, phone: user.phone, address: user.address || "" }); }, [user]);

  if (loading || !user || !token) return <Spinner label="Loading account…" />;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (form.phone.length < 13) { setMsg({ ok: false, text: "Enter a valid phone number, 9 digits after +233." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.updateProfile(token!, form);
      await refresh();
      setEditing(false);
      setMsg({ ok: true, text: "Profile updated." });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" }); }
    finally { setBusy(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await api.changePassword(token!, { current_password: pw.current, new_password: pw.next });
      login(res.access_token, res.user, true); // other devices are signed out; keep this one
      setPw({ current: "", next: "" });
      setMsg({ ok: true, text: "Password changed. Other devices have been signed out." });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not change password" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-ink">My Account</h1>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/wishlist" className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-ink hover:bg-surface">Wishlist</Link>
          <button onClick={() => { logout(); router.push("/"); }} className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-ink hover:bg-surface">Sign Out</button>
        </div>
      </div>

      <div className="mt-5 sm:mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="h-fit rounded-xl border border-border bg-white p-5">
          <div className="mb-4 flex gap-1 rounded-full bg-surface p-1 text-xs font-semibold">
            {(["profile", "password"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setMsg(null); setEditing(false); }}
                className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-white text-primary shadow-sm" : "text-muted"}`}>{t === "profile" ? "Profile" : "Password"}</button>
            ))}
          </div>
          {msg && <p role="status" className={`mb-3 rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>{msg.text}</p>}

          {tab === "profile" && !editing && (
            <>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-xs font-semibold text-muted">Name</dt><dd className="font-medium text-ink">{user.full_name}</dd></div>
                <div><dt className="text-xs font-semibold text-muted">Phone</dt><dd className="font-medium text-ink">{user.phone}</dd></div>
                <div><dt className="text-xs font-semibold text-muted">Delivery address</dt><dd className="font-medium text-ink">{user.address || "—"}</dd></div>
                <div><dt className="text-xs font-semibold text-muted">Member since</dt><dd className="font-medium text-ink">{fmtDate(user.created_at)}</dd></div>
              </dl>
              <button onClick={() => setEditing(true)} className="mt-4 rounded-full border border-primary px-5 py-2 text-xs font-bold text-primary hover:bg-primary hover:text-white">Edit profile</button>
            </>
          )}
          {tab === "profile" && editing && (
            <form onSubmit={saveProfile} className="space-y-3">
              <div><label className={label} htmlFor="p-name">Full name</label><input id="p-name" required minLength={2} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={input} /></div>
              <div><label className={label}>Phone</label><PhoneInput required value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="Phone number" /></div>
              <div><label className={label} htmlFor="p-addr">Delivery address</label><textarea id="p-addr" rows={3} maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-primary" /></div>
              <div className="flex gap-2">
                <button disabled={busy} className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-border px-5 py-2 text-xs font-semibold text-ink">Cancel</button>
              </div>
            </form>
          )}
          {tab === "password" && (
            <form onSubmit={changePassword} className="space-y-3">
              <div><label className={label} htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={input} /></div>
              <div><label className={label} htmlFor="pw-new">New password</label><input id="pw-new" type="password" required minLength={8} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={input} /><p className="mt-1 text-[11px] text-faint">At least 8 characters with letters and numbers.</p></div>
              <button disabled={busy} className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50">{busy ? "Updating…" : "Change password"}</button>
            </form>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white">
          <div className="border-b border-border px-5 py-4"><h2 className="text-base font-bold text-ink">Order History</h2></div>
          {ordersLoading ? (
            <Spinner label="Loading orders…" />
          ) : orders.length === 0 ? (
            <div className="p-5"><EmptyState title="No orders yet" hint="Your orders will appear here." actionHref="/products" actionLabel="Start shopping" /></div>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/account/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-surface">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">{o.order_number}</p>
                      <p className="text-xs text-muted">{fmtDate(o.created_at)} · {o.items_count} item{o.items_count !== 1 ? "s" : ""}</p>
                    </div>
                    <StatusBadge status={o.status} />
                    <span className="text-sm font-bold text-primary">{cedi(o.total)}</span>
                    <svg className="h-4 w-4 text-faint" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
