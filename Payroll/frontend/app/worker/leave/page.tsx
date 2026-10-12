"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, type LeaveBalance, type LeaveRequest } from "@/lib/api";
import { getWorkerToken } from "@/lib/worker";

const TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "STUDY", "UNPAID"];
const STYLE: Record<string, string> = {
  PENDING: "bg-amber-400/20 text-amber-200", APPROVED: "bg-emerald-400/20 text-emerald-200",
  REJECTED: "bg-red-400/20 text-red-200", CANCELLED: "bg-white/10 text-white/60",
};
const today = () => new Date().toISOString().slice(0, 10);
const box = "w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-white/50 [color-scheme:dark]";

export default function WorkerLeavePage() {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [bal, setBal] = useState<LeaveBalance | null>(null);
  const [form, setForm] = useState({ leave_type: "ANNUAL", start_date: today(), end_date: today(), reason: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    const t = getWorkerToken();
    if (!t) { window.location.href = "/worker"; return; }
    api.workerLeave(t).then(setRows).catch(() => {});
    api.workerLeaveBalance(t).then(setBal).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = getWorkerToken();
    if (!t) return;
    setBusy(true); setMsg(null);
    try {
      await api.workerRequestLeave(t, { ...form, reason: form.reason || undefined });
      setMsg({ ok: true, text: "Request sent, your manager will review it." });
      setForm({ ...form, reason: "" });
      load();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not send request" }); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#061161] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/worker/home" className="text-sm text-white/60 hover:text-white">← Back to portal</Link>
        <h1 className="mt-6 text-2xl font-black">Leave</h1>
        {bal && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[["Entitlement", bal.entitlement], ["Used", bal.used], ["Remaining", bal.remaining]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-white/10 py-3"><p className="text-xl font-black">{v}</p><p className="text-[11px] text-white/60">{l} days</p></div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl bg-white/5 p-4">
          <p className="text-sm font-bold">Request leave</p>
          <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })} className={box}>
            {TYPES.map((t) => <option key={t} value={t} className="text-black">{t.charAt(0) + t.slice(1).toLowerCase()}{t === "UNPAID" ? " (no pay)" : ""}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" min={today()} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: e.target.value > form.end_date ? e.target.value : form.end_date })} className={box} />
            <input type="date" min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={box} />
          </div>
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason (optional)" maxLength={200} className={box} />
          {msg && <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-400/20 text-emerald-100" : "bg-red-400/20 text-red-100"}`}>{msg.text}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-white py-2.5 text-sm font-bold text-[#061161] disabled:opacity-60">{busy ? "Sending…" : "Send request"}</button>
        </form>

        <div className="mt-6 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl bg-white/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.leave_type.charAt(0) + r.leave_type.slice(1).toLowerCase()} · {r.days} day{r.days !== 1 ? "s" : ""}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STYLE[r.status]}`}>{r.status}</span>
              </div>
              <p className="mt-0.5 text-xs text-white/60">{fmtDate(r.start_date)}, {fmtDate(r.end_date)}</p>
              {r.decision_note && <p className="mt-1 text-xs text-white/50">Note: {r.decision_note}</p>}
              {r.status === "PENDING" && (
                <button onClick={async () => { const t = getWorkerToken(); if (t) { await api.workerCancelLeave(t, r.id).catch(() => {}); load(); } }} className="mt-2 text-xs font-semibold text-red-200 hover:underline">Cancel request</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
