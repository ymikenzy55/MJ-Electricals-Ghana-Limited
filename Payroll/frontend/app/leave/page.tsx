"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, todayISO, type Employee, type LeaveBalance, type LeaveRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, inputCls } from "@/components/ui";

const LEAVE_TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "STUDY", "UNPAID"];

export default function LeavePage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"requests" | "balances">("requests");
  const [filter, setFilter] = useState("PENDING");
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: 0, leave_type: "ANNUAL", start_date: todayISO(), end_date: todayISO(), reason: "" });
  const [note, setNote] = useState<{ req: LeaveRequest; action: "reject" | "cancel" } | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([api.leave(token, { status: filter || undefined }), api.leaveBalances(token)])
      .then(([r, b]) => { setRows(r); setBalances(b); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, filter]);
  useEffect(load, [load]);
  useEffect(() => { if (token) api.employees(token, { status: "ACTIVE" }).then(setEmployees).catch(() => {}); }, [token]);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); setError(null); load(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  }

  async function create() {
    if (!token || !form.employee_id) return;
    await act(async () => {
      await api.createLeave(token, { ...form, reason: form.reason || undefined });
      setOpen(false);
    });
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Leave" breadcrumb="Payroll / Leave"
        subtitle="Approve requests from the worker portal or record leave for staff"
        actions={<Button onClick={() => setOpen(true)}>+ Record Leave</Button>} />

      <div className="mb-5 flex gap-2">
        {(["requests", "balances"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold ${tab === t ? "bg-primary text-white" : "border border-border text-ink hover:bg-surface"}`}>
            {t === "requests" ? "Requests" : "Balances"}
          </button>
        ))}
        {tab === "requests" && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} ml-auto w-auto`}>
            <option value="">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option>
          </select>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      {loading ? <Spinner /> : tab === "requests" ? (
        rows.length === 0 ? <EmptyState title="No leave requests" hint="Requests from workers appear here for approval." /> : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs font-semibold text-muted">
                  <th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Type</th><th className="pb-2 pr-4">Dates</th>
                  <th className="pb-2 pr-4">Days</th><th className="pb-2 pr-4">Status</th><th className="pb-2 text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-4"><p className="font-semibold text-ink">{r.employee_name}</p><p className="text-xs text-faint">{r.employee_code}</p></td>
                      <td className="py-2.5 pr-4 text-muted">{r.leave_type.charAt(0) + r.leave_type.slice(1).toLowerCase()}{r.reason && <p className="max-w-[220px] truncate text-xs text-faint" title={r.reason}>{r.reason}</p>}</td>
                      <td className="py-2.5 pr-4 text-muted">{fmtDate(r.start_date)}, {fmtDate(r.end_date)}</td>
                      <td className="py-2.5 pr-4 font-semibold">{r.days}</td>
                      <td className="py-2.5 pr-4"><Badge status={r.status} /></td>
                      <td className="whitespace-nowrap py-2.5 text-right">
                        {r.status === "PENDING" && <>
                          <button onClick={() => token && act(() => api.leaveAction(token, r.id, "approve"))} className="mr-3 text-xs font-semibold text-success hover:underline">Approve</button>
                          <button onClick={() => { setNote({ req: r, action: "reject" }); setNoteText(""); }} className="text-xs font-semibold text-error hover:underline">Reject</button>
                        </>}
                        {r.status === "APPROVED" && <button onClick={() => { setNote({ req: r, action: "cancel" }); setNoteText(""); }} className="text-xs font-semibold text-error hover:underline">Cancel</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-semibold text-muted">
                <th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Entitlement</th><th className="pb-2 pr-4">Used</th><th className="pb-2 pr-4">Pending</th><th className="pb-2">Remaining</th>
              </tr></thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.employee_id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4"><p className="font-semibold text-ink">{b.employee_name}</p><p className="text-xs text-faint">{b.employee_code}</p></td>
                    <td className="py-2.5 pr-4">{b.entitlement}</td><td className="py-2.5 pr-4">{b.used}</td><td className="py-2.5 pr-4 text-warning">{b.pending}</td>
                    <td className="py-2.5 font-bold text-primary">{b.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-faint">Annual-leave days for {balances[0]?.year ?? new Date().getFullYear()}. Change the entitlement under Settings.</p>
        </Card>
      )}

      {open && (
        <Modal title="Record Leave" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <Field label="Employee *">
              <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: parseInt(e.target.value) })} className={inputCls}>
                <option value={0}>Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
              </select>
            </Field>
            <Field label="Leave type">
              <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })} className={inputCls}>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}{t === "UNPAID" ? " (no pay)" : ""}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From"><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: e.target.value > form.end_date ? e.target.value : form.end_date })} className={inputCls} /></Field>
              <Field label="To"><input type="date" min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label="Reason"><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} /></Field>
            <p className="text-xs text-muted">Recorded leave goes to Pending; approve it to write the days into attendance. Weekends and public holidays are skipped automatically.</p>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={!form.employee_id}>Save</Button>
          </div>
        </Modal>
      )}

      {note && (
        <Modal title={note.action === "reject" ? "Reject leave" : "Cancel approved leave"} onClose={() => setNote(null)}>
          <Field label="Note (optional)"><input value={noteText} onChange={(e) => setNoteText(e.target.value)} className={inputCls} /></Field>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNote(null)}>Back</Button>
            <Button variant="danger" onClick={() => { const n = note; setNote(null); if (token) act(() => api.leaveAction(token, n.req.id, n.action, noteText || undefined)); }}>Confirm</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
