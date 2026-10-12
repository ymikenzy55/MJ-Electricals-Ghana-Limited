"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtTime, todayISO, type ScanLogRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Card, PageHeader, Spinner, inputCls } from "@/components/ui";
import AttendanceTabs from "@/components/AttendanceTabs";

function weekAgo() { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); }

export default function ScanLogPage() {
  const { token } = useAuth();
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(todayISO());
  const [flagged, setFlagged] = useState(false);
  const [rows, setRows] = useState<ScanLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.scanLog(token, from, to, flagged).then((r) => { setRows(r); setError(null); }).catch((e) => setError(e.message));
  }, [token, from, to, flagged]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);

  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Attendance" subtitle="Every scan attempt with the location it came from, including refused ones." />
      <AttendanceTabs />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} max-w-[11rem]`} aria-label="From" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} max-w-[11rem]`} aria-label="To" />
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />Only flagged</label>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-faint"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live</span>
      </div>
      {error && <p className="mb-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
      {!rows ? <Spinner /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-3">When</th><th className="px-4 py-3">Worker</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Distance</th><th className="px-4 py-3">Location</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-faint">No scans in this period.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id} className={`border-b border-border/60 ${r.flagged ? "bg-amber-50/50" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(r.at).toLocaleDateString("en-GH", { day: "numeric", month: "short" })} {fmtTime(r.at)}</td>
                    <td className="px-4 py-3"><p className="font-semibold text-ink">{r.employee_name ?? "Unknown"}</p><p className="text-xs text-faint">{r.employee_code}</p></td>
                    <td className="px-4 py-3">{r.kind.replace("_", " ").toLowerCase()}</td>
                    <td className="px-4 py-3"><Badge status={r.result} />{r.message && r.result !== "OK" && <p className="mt-1 max-w-xs text-xs text-faint">{r.message}</p>}{r.flagged && <p className="mt-1 text-xs font-semibold text-amber-700">Flagged for review</p>}</td>
                    <td className="px-4 py-3">{r.distance_m !== null ? `${Math.round(r.distance_m)} m` : "—"}</td>
                    <td className="px-4 py-3">{r.maps_url ? <a href={r.maps_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">View map</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
