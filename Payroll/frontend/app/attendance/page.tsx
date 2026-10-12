"use client";

import { useEffect, useState } from "react";
import { api, apiFormData, fmtDate, fmtTime, todayISO, type AttendanceRecord, type Employee } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, inputCls } from "@/components/ui";

const STATUSES = ["PRESENT", "LATE", "ABSENT", "LEAVE", "HALF_DAY"];

export default function AttendancePage() {
  const { token } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState("");
  const [empId, setEmpId] = useState(0);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [markOpen, setMarkOpen] = useState(false);
  const [mark, setMark] = useState({ employee_id: 0, date: todayISO(), status: "ABSENT", notes: "" });
  const [saving, setSaving] = useState(false);

  async function importAttendance(file: File) {
    if (!token) return;
    try { await apiFormData<AttendanceRecord[]>("/api/v1/attendance/import-csv", file, token); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
  }

  // When an employee + month is chosen, the filter shows that person's month.
  const monthView = empId > 0 && month;
  const effFrom = monthView ? `${month}-01` : from;
  const effTo = monthView
    ? new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0).toISOString().slice(0, 10)
    : to;

  const load = () => {
    if (!token) return;
    setLoading(true);
    api.attendance(token, {
      date_from: effFrom || undefined,
      date_to: effTo || undefined,
      employee_id: empId || undefined,
      status: status || undefined,
    })
      .then((r) => { setRecords(r); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [token, from, to, status, empId, month]);

  useEffect(() => {
    if (token) api.employees(token).then(setEmployees).catch(() => {});
  }, [token]);

  async function saveMark() {
    if (!token || !mark.employee_id) return;
    setSaving(true);
    try {
      await api.manualAttendance(token, {
        employee_id: mark.employee_id,
        date: mark.date,
        status: mark.status,
        notes: mark.notes || undefined,
      });
      setMarkOpen(false);
      setMark({ employee_id: 0, date: todayISO(), status: "ABSENT", notes: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Attendance"
        breadcrumb="Payroll / Attendance"
        actions={<><label className="cursor-pointer"><span className="inline-flex cursor-pointer items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink">Import CSV</span><input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importAttendance(file); e.currentTarget.value = ""; }} /></label><Button onClick={() => setMarkOpen(true)}>+ Mark Attendance</Button></>}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Employee">
          <select value={empId} onChange={(e) => setEmpId(parseInt(e.target.value))} className={`${inputCls} w-auto`}>
            <option value={0}>All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
          </select>
        </Field>
        {empId > 0 ? (
          <Field label="Month"><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} w-auto`} /></Field>
        ) : (
          <>
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-auto`} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-auto`} /></Field>
          </>
        )}
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </Field>
        <Button variant="secondary" onClick={() => { setFrom(todayISO()); setTo(todayISO()); setStatus(""); setEmpId(0); setMonth(todayISO().slice(0, 7)); }}>Reset</Button>
      </div>

      {empId > 0 && !loading && records.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(["PRESENT", "LATE", "ABSENT", "LEAVE", "HALF_DAY"] as const).map((s) => (
            <div key={s} className="rounded-xl border border-border bg-white p-3 text-center shadow-sm">
              <p className="text-2xl font-black text-ink">{records.filter((r) => r.status === s).length}</p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-faint">{s.replace("_", " ")}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      <Card>
        {loading ? (
          <Spinner />
        ) : records.length === 0 ? (
          <EmptyState title="No attendance records" hint="Workers scan the wall QR code in the app, or you can mark attendance manually." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold text-muted">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Employee</th>
                  <th className="pb-2 pr-4">Check In</th>
                  <th className="pb-2 pr-4">Check Out</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Notes</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4 text-muted">{fmtDate(r.date)}</td>
                    <td className="py-2.5 pr-4">
                      <p className="font-semibold text-ink">{r.employee_name}</p>
                      <p className="text-xs text-faint">{r.employee_code}</p>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-muted">{fmtTime(r.check_in)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-muted">{fmtTime(r.check_out)}</td>
                    <td className="py-2.5 pr-4"><Badge status={r.status} /></td>
                    <td className="py-2.5 pr-4 text-xs text-muted">{r.notes || "—"}</td>
                    <td className="py-2.5 text-right">
                      <button onClick={async () => { if (token && confirm(`Remove this record for ${r.employee_name}?`)) { try { await api.deleteAttendance(token, r.id); load(); } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); } } }} className="text-xs font-semibold text-error hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {markOpen && (
        <Modal title="Mark Attendance" onClose={() => setMarkOpen(false)}>
          <div className="space-y-4">
            <Field label="Employee *">
              <select value={mark.employee_id} onChange={(e) => setMark({ ...mark, employee_id: parseInt(e.target.value) })} className={inputCls}>
                <option value={0}>Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
              </select>
            </Field>
            <Field label="Date *"><input type="date" value={mark.date} onChange={(e) => setMark({ ...mark, date: e.target.value })} className={inputCls} /></Field>
            <Field label="Status">
              <select value={mark.status} onChange={(e) => setMark({ ...mark, status: e.target.value })} className={inputCls}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </Field>
            <Field label="Notes"><input value={mark.notes} onChange={(e) => setMark({ ...mark, notes: e.target.value })} className={inputCls} placeholder="Optional" /></Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMarkOpen(false)}>Cancel</Button>
            <Button onClick={saveMark} disabled={saving || !mark.employee_id || !mark.date}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
