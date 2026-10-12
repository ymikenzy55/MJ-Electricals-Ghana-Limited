"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtTime, type MonthSummary, type WorkerDay } from "@/lib/api";
import { clearWorkerSession, getWorkerToken } from "@/lib/worker";
import WorkerShell from "@/components/WorkerShell";

const CHIP: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700", LATE: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-700", LEAVE: "bg-blue-100 text-blue-700", HALF_DAY: "bg-blue-100 text-blue-700",
  HOLIDAY: "bg-purple-100 text-purple-700", REST_DAY: "bg-slate-100 text-slate-500", UPCOMING: "bg-slate-50 text-slate-400",
};

function thisMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function shift(m: string, by: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function WorkerHistoryPage() {
  const [month, setMonth] = useState(thisMonth());
  const [days, setDays] = useState<WorkerDay[]>([]);
  const [sum, setSum] = useState<MonthSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const t = getWorkerToken();
    if (!t) return;
    try {
      const r = await api.workerHistory(t, month);
      setDays(r.days); setSum(r.summary); setErr(null);
    } catch (e) {
      if ((e as { status?: number }).status === 401) { clearWorkerSession(); window.location.href = "/worker"; return; }
      setErr("Can't reach the server. Retrying…");
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => {
    setLoading(true); load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => clearInterval(id);
  }, [load]);

  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GH", { month: "long", year: "numeric" });
  const shown = days.filter((d) => d.status !== "UPCOMING").reverse();

  return (
    <WorkerShell title="Attendance history">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-2 py-1.5 shadow-sm">
        <button onClick={() => setMonth(shift(month, -1))} aria-label="Previous month" className="rounded-lg px-3 py-2 text-lg text-[#061161]">‹</button>
        <p className="text-sm font-bold text-[#111318]">{label}</p>
        <button onClick={() => setMonth(shift(month, 1))} disabled={month >= thisMonth()} aria-label="Next month" className="rounded-lg px-3 py-2 text-lg text-[#061161] disabled:opacity-30">›</button>
      </div>
      {err && <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800" role="status">{err}</p>}

      {sum && (
        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          {[["Attended", `${parseFloat(sum.days_attended)}/${sum.days_total}`], ["Late", sum.late], ["Absent", sum.absent], ["Leave", sum.leave]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-white py-2.5 shadow-sm"><p className="text-sm font-bold text-[#111318]">{v}</p><p className="text-[10px] text-[#8A8F98]">{l}</p></div>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {loading && <li className="py-8 text-center text-sm text-[#8A8F98]">Loading…</li>}
        {!loading && shown.length === 0 && <li className="rounded-2xl bg-white p-6 text-center text-sm text-[#8A8F98]">Nothing recorded for this month yet.</li>}
        {shown.map((d) => (
          <li key={d.date} className="rounded-2xl bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#111318]">{new Date(`${d.date}T00:00:00`).toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" })}</p>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CHIP[d.status] ?? "bg-slate-100 text-slate-600"}`}>{d.status.replace("_", " ")}</span>
            </div>
            {d.check_in && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[#5F6368]">
                <div><p className="text-[10px] text-[#8A8F98]">In</p><p className="font-semibold text-[#111318]">{fmtTime(d.check_in)}</p></div>
                <div><p className="text-[10px] text-[#8A8F98]">Out</p><p className="font-semibold text-[#111318]">{d.check_out ? fmtTime(d.check_out) : "—"}</p></div>
                <div><p className="text-[10px] text-[#8A8F98]">Hours</p><p className="font-semibold text-[#111318]">{parseFloat(d.hours) ? `${parseFloat(d.hours).toFixed(1)}h` : "—"}</p></div>
              </div>
            )}
            {(d.late_minutes > 0 || d.distance_m !== null) && (
              <p className="mt-1.5 text-[11px] text-[#8A8F98]">
                {d.late_minutes > 0 ? `${d.late_minutes} min late` : ""}{d.late_minutes > 0 && d.distance_m !== null ? " · " : ""}{d.distance_m !== null ? `scanned ${Math.round(d.distance_m)} m from the office` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </WorkerShell>
  );
}
