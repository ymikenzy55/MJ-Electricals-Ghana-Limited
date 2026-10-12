"use client";

import { useCallback, useEffect, useState } from "react";
import { api, cedi, fmtDate, type Employee, type Loan } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, inputCls } from "@/components/ui";

export default function LoansPage() {
  const { token } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: 0, principal: "", installment: "", reason: "" });
  const [cancelling, setCancelling] = useState<Loan | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.loans(token).then((l) => { setLoans(l); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);
  useEffect(load, [load]);
  useEffect(() => { if (token) api.employees(token, { status: "ACTIVE" }).then(setEmployees).catch(() => {}); }, [token]);

  async function create() {
    if (!token) return;
    try {
      await api.createLoan(token, {
        employee_id: form.employee_id, principal: parseFloat(form.principal),
        installment: parseFloat(form.installment), reason: form.reason || undefined,
      });
      setOpen(false); setForm({ employee_id: 0, principal: "", installment: "", reason: "" }); load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  const outstanding = loans.filter((l) => l.status === "ACTIVE").reduce((s, l) => s + parseFloat(l.balance), 0);
  const valid = form.employee_id && parseFloat(form.principal) > 0 && parseFloat(form.installment) > 0;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Loans & Advances" breadcrumb="Payroll / Loans"
        subtitle={`Outstanding: ${cedi(outstanding)}, instalments are deducted automatically in each payroll run`}
        actions={<Button onClick={() => setOpen(true)}>+ New Loan</Button>} />
      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}
      {loading ? <Spinner /> : loans.length === 0 ? <EmptyState title="No loans or salary advances" hint="Issue one and it will be repaid through payroll." /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-semibold text-muted">
                <th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Issued</th><th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Instalment</th><th className="pb-2 pr-4">Balance</th><th className="pb-2 pr-4">Status</th><th className="pb-2" />
              </tr></thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4"><p className="font-semibold text-ink">{l.employee_name}</p><p className="text-xs text-faint">{l.reason || l.employee_code}</p></td>
                    <td className="py-2.5 pr-4 text-muted">{fmtDate(l.issued_date)}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{cedi(l.principal)}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{cedi(l.installment)}</td>
                    <td className="py-2.5 pr-4 font-bold tabular-nums text-primary">{cedi(l.balance)}</td>
                    <td className="py-2.5 pr-4"><Badge status={l.status} /></td>
                    <td className="py-2.5 text-right">{l.status === "ACTIVE" && <button onClick={() => setCancelling(l)} className="text-xs font-semibold text-error hover:underline">Write off</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {open && (
        <Modal title="New Loan / Salary Advance" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <Field label="Employee *">
              <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: parseInt(e.target.value) })} className={inputCls}>
                <option value={0}>Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount (₵) *"><input type="number" min="0" step="0.01" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} className={inputCls} /></Field>
              <Field label="Deduct per run (₵) *"><input type="number" min="0" step="0.01" value={form.installment} onChange={(e) => setForm({ ...form, installment: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label="Reason"><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} placeholder="e.g. Salary advance" /></Field>
            {valid && <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">About {Math.ceil(parseFloat(form.principal) / parseFloat(form.installment))} payroll run(s) to repay.</p>}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={!valid}>Issue loan</Button>
          </div>
        </Modal>
      )}
      {cancelling && (
        <Modal title="Write off loan" onClose={() => setCancelling(null)}>
          <p className="text-sm text-muted">Stop deductions for {cancelling.employee_name}? The remaining balance of {cedi(cancelling.balance)} will be written off.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelling(null)}>Back</Button>
            <Button variant="danger" onClick={async () => { const l = cancelling; setCancelling(null); if (token) { try { await api.cancelLoan(token, l.id); load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } } }}>Write off</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
