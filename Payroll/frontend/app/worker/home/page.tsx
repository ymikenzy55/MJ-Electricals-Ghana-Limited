"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fmtTime, type WorkerHome } from "@/lib/api";
import { clearWorkerSession, getWorkerToken } from "@/lib/worker";
import WorkerShell from "@/components/WorkerShell";
import { readHomeCache, saveHomeCache } from "@/lib/offline-scan";

const CHIP: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700", LATE: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-700", LEAVE: "bg-blue-100 text-blue-700", HALF_DAY: "bg-blue-100 text-blue-700",
};

function hoursText(h: string | number) {
  const n = typeof h === "string" ? parseFloat(h) : h;
  if (!n) return "0h";
  const hh = Math.floor(n), mm = Math.round((n - hh) * 60);
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

export default function WorkerHomePage() {
  const [data, setData] = useState<WorkerHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = getWorkerToken();
    if (!t) return;
    try { const d = await api.workerHome(t); setData(d); saveHomeCache(d); setError(null); }
    catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) { clearWorkerSession(); window.location.href = "/worker"; return; }
      { const c = readHomeCache<WorkerHome>(); if (c) setData((prev) => prev ?? c.data); setError("You're offline. Showing what was saved earlier. You can still scan."); }
    }
  }, []);

  // live: refresh every few seconds and whenever the app comes back to the front
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 8000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const today = data?.today;
  const s = data?.summary;
  const state = !today?.check_in ? "none" : today.check_out ? "done" : "in";
  const first = data?.employee.full_name.split(" ")[0] ?? "";
  const hour = new Date().getHours();

  return (
    <WorkerShell title="Home">
      {error && <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800" role="status">{error}</p>}

      <p className="text-sm text-[#5F6368]">{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}</p>
      <h2 className="text-xl font-bold text-[#111318]">{first || "…"}</h2>

      {/* Today */}
      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8A8F98]">Today · {new Date().toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "short" })}</p>
          {today && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CHIP[today.status] ?? "bg-slate-100 text-slate-600"}`}>{today.status.replace("_", " ")}</span>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#F3F4F9] py-2.5"><p className="text-[11px] text-[#8A8F98]">Came in</p><p className="text-sm font-bold text-[#111318]">{today?.check_in ? fmtTime(today.check_in) : "—"}</p></div>
          <div className="rounded-xl bg-[#F3F4F9] py-2.5"><p className="text-[11px] text-[#8A8F98]">Left</p><p className="text-sm font-bold text-[#111318]">{today?.check_out ? fmtTime(today.check_out) : "—"}</p></div>
          <div className="rounded-xl bg-[#F3F4F9] py-2.5"><p className="text-[11px] text-[#8A8F98]">Hours</p><p className="text-sm font-bold text-[#111318]">{today ? hoursText(today.hours) : "—"}</p></div>
        </div>
        {today?.late_minutes ? <p className="mt-2 text-xs font-medium text-amber-700">You reported {today.late_minutes} min after {data?.office.start_time}.</p> : null}
        {state !== "done" ? (
          <Link href="/worker/scan" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#061161] py-3 text-sm font-semibold text-white shadow hover:bg-[#0A1C8C]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M4 12h16" /></svg>
            {state === "none" ? "Scan to check in" : "Scan to check out"}
          </Link>
        ) : (
          <p className="mt-4 rounded-xl bg-emerald-50 py-3 text-center text-sm font-semibold text-emerald-700">You&apos;re done for today. See you tomorrow.</p>
        )}
      </section>

      {/* This month */}
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#111318]">This month</h3>
          <Link href="/worker/history" className="text-xs font-semibold text-[#061161]">Full history</Link>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-end justify-between">
              <div><p className="text-xs text-[#8A8F98]">Days attended</p><p className="text-2xl font-black text-[#061161]">{s ? parseFloat(s.days_attended) : "—"}<span className="text-base font-semibold text-[#8A8F98]"> / {s?.days_total ?? "—"}</span></p></div>
              <p className="text-sm font-bold text-[#111318]">{s ? Math.round(s.pct) : 0}%</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EBF5]"><div className="h-full rounded-full bg-[#061161] transition-all" style={{ width: `${Math.min(s?.pct ?? 0, 100)}%` }} /></div>
          </div>
          {[["Late", s?.late ?? 0, "text-amber-600"], ["Absent", s?.absent ?? 0, "text-red-600"], ["On leave", s?.leave ?? 0, "text-blue-600"], ["Hours worked", s ? hoursText(s.hours) : "—", "text-[#111318]"]].map(([l, v, c]) => (
            <div key={l as string} className="rounded-2xl bg-white p-3.5 shadow-sm"><p className="text-xs text-[#8A8F98]">{l}</p><p className={`text-xl font-bold ${c}`}>{v}</p></div>
          ))}
        </div>
      </section>

      {/* Recent scans */}
      <section className="mt-5">
        <h3 className="mb-2 text-sm font-bold text-[#111318]">Your recent scans</h3>
        <ul className="divide-y divide-[#EEF0F6] rounded-2xl bg-white shadow-sm">
          {data?.recent_scans.length === 0 && <li className="p-4 text-center text-sm text-[#8A8F98]">No scans yet. Scan the QR code at the office to check in.</li>}
          {data?.recent_scans.map((sc, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-[#111318]">{sc.kind === "CHECK_IN" ? "Checked in" : sc.kind === "CHECK_OUT" ? "Checked out" : "Not accepted"}</p>
                <p className="truncate text-xs text-[#8A8F98]">{new Date(sc.at).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{sc.result !== "OK" && sc.message ? ` · ${sc.message}` : ""}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${sc.result === "OK" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{sc.result === "OK" ? "OK" : "Refused"}</span>
            </li>
          ))}
        </ul>
      </section>
    </WorkerShell>
  );
}
