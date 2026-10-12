"use client";

import { useEffect, useState } from "react";
import { api, cedi, downloadFile, todayISO, type AttendanceReportRow, type PayrollSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, EmptyState, Field, PageHeader, Spinner, inputCls } from "@/components/ui";

export default function ReportsPage() {
  const { token } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [att, setAtt] = useState<AttendanceReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setSummary(null);
    api.payrollSummary(token, year).then(setSummary).catch((e) => setError(e.message));
  }, [token, year]);

  useEffect(() => {
    if (!token) return;
    api.attendanceReport(token, from, to).then(setAtt).catch((e) => setError(e.message));
  }, [token, from, to]);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Reports" breadcrumb="Payroll / Reports" subtitle="Payroll cost, statutory totals and attendance"
        actions={<select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className={`${inputCls} w-auto`}>
          {[0, 1, 2, 3].map((i) => <option key={i} value={now.getFullYear() - i}>{now.getFullYear() - i}</option>)}
        </select>} />
      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      {!summary ? <Spinner /> : summary.months.length === 0 ? <EmptyState title={`No payroll runs in ${year}`} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {([["Gross pay", "gross"], ["Net pay", "net"], ["PAYE tax", "paye"], ["SSNIT (both)", "ssnit"], ["Total employer cost", "employer_cost"]] as const).map(([l, k]) => (
              <div key={l} className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs font-medium text-muted">{l}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-ink">
                  {cedi(k === "ssnit" ? parseFloat(summary.totals.ssnit_employee) + parseFloat(summary.totals.ssnit_employer) : parseFloat(summary.totals[k]))}
                </p>
              </div>
            ))}
          </div>
          <Card title={`Payroll by run, ${year}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs font-semibold text-muted">
                  <th className="pb-2 pr-4">Run</th><th className="pb-2 pr-4">Staff</th><th className="pb-2 pr-4">Gross</th><th className="pb-2 pr-4">SSNIT (ee)</th>
                  <th className="pb-2 pr-4">SSNIT (er)</th><th className="pb-2 pr-4">PAYE</th><th className="pb-2 pr-4">Net</th><th className="pb-2">Employer cost</th>
                </tr></thead>
                <tbody>
                  {summary.months.map((m) => (
                    <tr key={m.run_id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-semibold text-ink">{m.label} <span className="text-[10px] text-faint">{m.status}</span></td>
                      <td className="py-2 pr-4">{m.employees}</td>
                      {[m.gross, m.ssnit_employee, m.ssnit_employer, m.paye, m.net, m.employer_cost].map((v, i) => <td key={i} className="py-2 pr-4 tabular-nums">{cedi(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {summary.departments.length > 0 && (
            <div className="mt-5">
              <Card title={`Department cost, ${summary.latest_run}`}>
                <div className="space-y-2">
                  {summary.departments.map((d) => {
                    const max = Math.max(...summary.departments.map((x) => parseFloat(x.gross)), 1);
                    return (
                      <div key={d.department}>
                        <div className="flex justify-between text-xs"><span className="font-semibold text-ink">{d.department} <span className="text-faint">({d.employees})</span></span><span className="tabular-nums text-muted">{cedi(d.gross)}</span></div>
                        <div className="mt-1 h-2 rounded-full bg-surface"><div className="h-2 rounded-full bg-primary" style={{ width: `${(parseFloat(d.gross) / max) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      <div className="mt-8">
        <Card title="Attendance report" action={token ? <Button variant="secondary" onClick={() => downloadFile(`/api/v1/attendance/report.csv?date_from=${from}&date_to=${to}`, token, `attendance_${from}_${to}.csv`)}>Export CSV</Button> : null}>
          <div className="mb-4 flex flex-wrap gap-3">
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-auto`} /></Field>
          </div>
          {!att ? <Spinner /> : att.length === 0 ? <p className="py-6 text-center text-sm text-muted">No attendance in this range.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs font-semibold text-muted">
                  <th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Present</th><th className="pb-2 pr-4">Late</th><th className="pb-2 pr-4">Absent</th>
                  <th className="pb-2 pr-4">Leave</th><th className="pb-2 pr-4">Hours</th><th className="pb-2">Overtime hrs</th>
                </tr></thead>
                <tbody>
                  {att.map((r) => (
                    <tr key={r.employee_id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4"><p className="font-semibold text-ink">{r.employee_name}</p><p className="text-xs text-faint">{r.employee_code} · {r.department || "—"}</p></td>
                      <td className="py-2 pr-4 text-success">{r.present}</td><td className="py-2 pr-4 text-warning">{r.late}</td>
                      <td className="py-2 pr-4 text-error">{r.absent}</td><td className="py-2 pr-4 text-info">{r.leave}</td>
                      <td className="py-2 pr-4 tabular-nums">{parseFloat(r.hours_worked).toFixed(1)}</td><td className="py-2 tabular-nums">{parseFloat(r.overtime_hours).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
