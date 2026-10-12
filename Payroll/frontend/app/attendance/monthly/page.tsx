"use client";

import { useCallback, useEffect, useState } from "react";
import { api, cedi, fmtDate, fmtTime, type MonthlyDetail, type MonthlyReport } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Field, Modal, PageHeader, Spinner, inputCls } from "@/components/ui";
import AttendanceTabs from "@/components/AttendanceTabs";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function MonthlyPage() {
  const { token } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.monthly(token, month).then((r) => { setReport(r); setError(null); }).catch((e) => setError(e.message));
  }, [token, month]);
  useEffect(() => { setReport(null); load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 12000); return () => clearInterval(id); }, [load]);

  const rows = report?.rows.filter((r) => !q || r.employee_name.toLowerCase().includes(q.toLowerCase()) || r.employee_code.toLowerCase().includes(q.toLowerCase())) ?? [];
  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GH", { month: "long", year: "numeric" });

  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Attendance" subtitle={`Monthly register for ${label}. Click a worker for the full breakdown.`} />
      <AttendanceTabs />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} className={`${inputCls} max-w-[12rem]`} aria-label="Month" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a worker" className={`${inputCls} max-w-xs`} aria-label="Search" />
        {report && <span className="text-sm text-muted">{report.working_days} working days in the month</span>}
      </div>
      {error && <p className="mb-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
      {!report ? <Spinner /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-3">Worker</th><th className="px-4 py-3">Days attended</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Leave</th><th className="px-4 py-3">Suggested</th><th className="px-4 py-3">Paid</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-faint">No workers found.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.employee_id} onClick={() => setOpenId(r.employee_id)} className="cursor-pointer border-b border-border/60 hover:bg-surface">
                    <td className="px-4 py-3"><button className="text-left font-semibold text-primary hover:underline">{r.employee_name}</button><p className="text-xs text-faint">{r.employee_code}{r.department ? ` · ${r.department}` : ""}</p></td>
                    <td className="px-4 py-3"><span className="text-base font-black text-ink">{parseFloat(r.days_attended)}</span><span className="text-muted"> out of {r.days_total}</span>
                      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.pct, 100)}%` }} /></div></td>
                    <td className="px-4 py-3">{r.late || "—"}</td>
                    <td className={`px-4 py-3 ${r.absent ? "font-semibold text-red-600" : ""}`}>{r.absent || "—"}</td>
                    <td className="px-4 py-3">{r.leave || "—"}</td>
                    <td className="px-4 py-3">{cedi(r.suggested_amount)}</td>
                    <td className="px-4 py-3 font-semibold">{parseFloat(r.paid_amount) ? cedi(r.paid_amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {openId !== null && token && <DetailModal id={openId} month={month} token={token} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function DetailModal({ id, month, token, onClose, onChanged }: { id: number; month: string; token: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<MonthlyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "CASH", reference: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api.monthlyDetail(token, id, month).then((r) => { setD(r); setError(null); }).catch((e) => setError(e.message));
  }, [token, id, month]);
  useEffect(() => { load(); }, [load]);

  async function record() {
    const amount = parseFloat(pay.amount);
    if (!amount || amount <= 0) { setError("Enter an amount greater than zero."); return; }
    setSaving(true); setError(null);
    try {
      await api.recordPayment(token, { employee_id: id, period: month, amount, method: pay.method, reference: pay.reference || undefined, note: pay.note || undefined });
      setPay({ amount: "", method: pay.method, reference: "", note: "" });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      load(); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the payment"); } finally { setSaving(false); }
  }

  return (
    <Modal title={d ? d.employee.name : "Worker details"} onClose={onClose} wide>
      {!d ? (error ? <p className="text-sm text-error">{error}</p> : <Spinner />) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Days attended", `${parseFloat(d.summary.days_attended)} of ${d.summary.days_total}`], ["Late", `${d.summary.late} (${d.summary.late_minutes} min)`], ["Absent", d.summary.absent], ["Hours", parseFloat(d.summary.hours).toFixed(1)]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-border p-3"><p className="text-xs text-faint">{l}</p><p className="text-base font-bold text-ink">{v}</p></div>
            ))}
          </div>
          <p className="text-sm text-muted">{d.employee.code}{d.employee.position ? ` · ${d.employee.position}` : ""}{d.employee.phone ? ` · ${d.employee.phone}` : ""}</p>

          {/* Payment */}
          <div className="rounded-xl bg-surface p-4">
            <p className="text-sm font-bold text-ink">Pay for {month}</p>
            <p className="mt-0.5 text-sm text-muted">Based on attendance the amount comes to <b className="text-ink">{cedi(d.suggested_amount)}</b>. Already paid: <b className="text-ink">{cedi(d.paid_amount)}</b>.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <Field label="Amount (₵)"><input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className={inputCls} placeholder={parseFloat(d.suggested_amount).toFixed(2)} /></Field>
              <Field label="Method"><select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={inputCls}><option value="CASH">Cash</option><option value="MOMO">Mobile money</option><option value="BANK">Bank</option></select></Field>
              <Field label="Reference"><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} className={inputCls} /></Field>
              <Field label="Note"><input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} className={inputCls} /></Field>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button onClick={record} disabled={saving}>{saving ? "Saving…" : "Record payment"}</Button>
              <Button variant="secondary" onClick={() => setPay({ ...pay, amount: parseFloat(d.suggested_amount).toFixed(2) })}>Use suggested amount</Button>
              {saved && <span className="text-sm font-semibold text-emerald-600">Payment recorded</span>}
            </div>
            {error && <p className="mt-2 text-sm text-error">{error}</p>}
            {d.payments.length > 0 && (
              <ul className="mt-3 divide-y divide-border text-sm">
                {d.payments.map((p) => <li key={p.id} className="flex justify-between py-1.5"><span className="text-muted">{fmtDate(p.paid_at)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</span><b>{cedi(p.amount)}</b></li>)}
              </ul>
            )}
          </div>

          {/* Days */}
          <div className="max-h-80 overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">In</th><th className="px-3 py-2">Out</th><th className="px-3 py-2">Late</th><th className="px-3 py-2">Location</th></tr></thead>
              <tbody>
                {d.days.filter((x) => x.status !== "UPCOMING").map((x) => (
                  <tr key={x.date} className="border-b border-border/60">
                    <td className="px-3 py-2 whitespace-nowrap">{x.weekday.slice(0, 3)} {fmtDate(x.date)}</td>
                    <td className="px-3 py-2"><Badge status={x.status} /></td>
                    <td className="px-3 py-2">{fmtTime(x.check_in)}</td>
                    <td className="px-3 py-2">{fmtTime(x.check_out)}</td>
                    <td className="px-3 py-2">{x.late_minutes ? `${x.late_minutes} min` : "—"}</td>
                    <td className="px-3 py-2">{x.distance_m !== null ? <>{Math.round(x.distance_m)} m {x.maps_url && <a href={x.maps_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs font-semibold text-primary hover:underline">Map</a>}{x.flagged && <span className="ml-1 text-xs font-bold text-amber-700">Check</span>}</> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
