"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { getWorkerToken } from "@/lib/worker";
import WorkerShell from "@/components/WorkerShell";

const box = "w-full rounded-xl border border-[#E6E7EB] bg-white px-3 py-2.5 text-sm focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]";

export default function WorkerAccountPage() {
  const [f, setF] = useState({ current_pin: "", new_pin: "", confirm: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = getWorkerToken();
    if (!t) { window.location.href = "/worker"; return; }
    if (f.new_pin !== f.confirm) { setMsg({ ok: false, text: "The new passwords don't match." }); return; }
    if (f.new_pin.length < 6) { setMsg({ ok: false, text: "Use at least 6 characters." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.workerChangePin(t, { current_pin: f.current_pin, new_pin: f.new_pin });
      setF({ current_pin: "", new_pin: "", confirm: "" });
      setMsg({ ok: true, text: "Password updated." });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not update the password" }); }
    finally { setBusy(false); }
  }

  return (
    <WorkerShell title="Change password" back>
      <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <input type="password" placeholder="Current password or PIN" value={f.current_pin} onChange={(e) => setF({ ...f, current_pin: e.target.value })} className={box} autoComplete="current-password" />
        <input type="password" placeholder="New password (6 or more characters)" value={f.new_pin} onChange={(e) => setF({ ...f, new_pin: e.target.value })} className={box} autoComplete="new-password" />
        <input type="password" placeholder="Confirm new password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} className={box} autoComplete="new-password" />
        {msg && <p role="status" className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
        <button disabled={busy || !f.current_pin || !f.new_pin} className="w-full rounded-xl bg-[#061161] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Update password"}</button>
      </form>
    </WorkerShell>
  );
}
