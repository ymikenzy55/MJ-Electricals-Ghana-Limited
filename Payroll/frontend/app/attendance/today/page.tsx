"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtTime, todayISO, type DailyBoard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Card, PageHeader, Spinner, inputCls } from "@/components/ui";
import AttendanceTabs from "@/components/AttendanceTabs";

export default function TodayPage() {
  const { token } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const load = useCallback(() => {
    if (!token) return;
    api.daily(token, date).then((b) => { setBoard(b); setError(null); }).catch((e) => setError(e.message));
  }, [token, date]);

  useEffect(() => { setBoard(null); load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);

  const rows = board?.rows.filter((r) => filter === "ALL" || r.status === filter) ?? [];
  const absent = board?.rows.filter((r) => r.status === "ABSENT") ?? [];

  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Attendance" subtitle="Who came in, where they scanned from, and who did not show up." />
      <AttendanceTabs />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} className={`${inputCls} max-w-[11rem]`} aria-label="Date" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} max-w-[11rem]`} aria-label="Filter by status">
          {["ALL", "PRESENT", "LATE", "ABSENT", "LEAVE"].map((s) => <option key={s} value={s}>{s === "ALL" ? "Everyone" : s[0] + s.slice(1).toLowerCase()}</option>)}
        </select>
        {board?.holiday && <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">Holiday: {board.holiday}</span>}
        {board && !board.is_working_day && !board.holiday && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Not a working day</span>}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-faint"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live</span>
      </div>

      {error && <p className="mb-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
      {!board ? <Spinner /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[["Total", board.total, "text-ink"], ["Present", board.summary.PRESENT ?? 0, "text-emerald-600"], ["Late", board.summary.LATE ?? 0, "text-amber-600"], ["Absent", board.summary.ABSENT ?? 0, "text-red-600"], ["On leave", board.summary.LEAVE ?? 0, "text-blue-600"]].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl border border-border p-4"><p className="text-xs text-faint">{l}</p><p className={`text-2xl font-black ${c}`}>{v}</p></div>
            ))}
          </div>

          {absent.length > 0 && board.is_working_day && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-800">Not present ({absent.length})</p>
              <p className="mt-1 text-sm text-red-700">{absent.map((a) => a.employee_name).join(", ")}</p>
            </div>
          )}

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-3">Worker</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">In</th><th className="px-4 py-3">Out</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Scan location</th>
                </tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-faint">No one matches this filter.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.employee_id} className={`border-b border-border/60 ${r.status === "ABSENT" ? "bg-red-50/40" : ""}`}>
                      <td className="px-4 py-3"><p className="font-semibold text-ink">{r.employee_name}</p><p className="text-xs text-faint">{r.employee_code}{r.department ? ` · ${r.department}` : ""}</p></td>
                      <td className="px-4 py-3"><Badge status={r.status} /></td>
                      <td className="px-4 py-3">{fmtTime(r.check_in)}</td>
                      <td className="px-4 py-3">{fmtTime(r.check_out)}</td>
                      <td className="px-4 py-3">{parseFloat(r.hours) ? `${parseFloat(r.hours).toFixed(1)}h` : "—"}</td>
                      <td className="px-4 py-3">{r.late_minutes ? `${r.late_minutes} min` : "—"}</td>
                      <td className="px-4 py-3">
                        {r.distance_m !== null ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <span>{Math.round(r.distance_m)} m away</span>
                            {r.maps_url && <a href={r.maps_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">Map</a>}
                            {r.flagged && <span title={r.flag_reason ?? ""} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Check</span>}
                          </span>
                        ) : r.source === "MANUAL" ? <span className="text-xs text-faint">Entered by admin</span> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
