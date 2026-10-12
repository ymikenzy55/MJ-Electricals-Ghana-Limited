"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, cedi, fmtDate, type PayrollRun } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Spinner, inputCls } from "@/components/ui";

export default function PayrollPage() {
  const { token } = useAuth();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", period_start: "", period_end: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!token) return;
    setLoading(true);
    api.runs(token).then(setRuns).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [token]);

  function openNew() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    setForm({
      label: now.toLocaleDateString("en-GH", { month: "long", year: "numeric" }) + " Payroll",
      period_start: start,
      period_end: end,
    });
    setOpen(true);
  }

  async function create() {
    if (!token) return;
    setSaving(true);
    try {
      await api.createRun(token, form);
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create run");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Payroll Runs"
        breadcrumb="Payroll / Runs"
        actions={<Button onClick={openNew}>+ New Payroll Run</Button>}
      />

      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      {loading ? (
        <Spinner />
      ) : runs.length === 0 ? (
        <EmptyState title="No payroll runs yet" hint="Create a run to generate payslips from attendance records." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-semibold text-muted">
                <th className="px-5 py-3">Run</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Employees</th>
                <th className="px-4 py-3">Total Net Pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface/60">
                  <td className="px-5 py-3">
                    <Link href={`/payroll/${r.id}`} className="font-semibold text-primary hover:underline">{r.label}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{fmtDate(r.period_start)}, {fmtDate(r.period_end)}</td>
                  <td className="px-4 py-3 text-muted">{r.payslips_count}</td>
                  <td className="px-4 py-3 font-bold text-ink">{cedi(r.total_net)}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                  <td className="px-4 py-3 text-muted">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title="New Payroll Run" onClose={() => setOpen(false)}>
          <p className="mb-4 rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
            Payslips are generated automatically for every active employee from their attendance
            during the period. You can adjust allowances and deductions before approving.
          </p>
          <div className="space-y-4">
            <Field label="Run Label *"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Period Start *"><input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className={inputCls} /></Field>
              <Field label="Period End *"><input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className={inputCls} /></Field>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.label || !form.period_start || !form.period_end}>
              {saving ? "Creating…" : "Create Run"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
