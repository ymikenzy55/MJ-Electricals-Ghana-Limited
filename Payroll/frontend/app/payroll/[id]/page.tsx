"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { api, cedi, downloadFile, fmtDate, type PayrollRun, type Payslip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Field, Modal, PageHeader, Spinner, inputCls } from "@/components/ui";

const EXPORTS = [
  ["register", "Payroll register"],
  ["bank", "Bank / MoMo payments"],
  ["ssnit", "SSNIT schedule"],
  ["paye", "GRA PAYE schedule"],
] as const;

export default function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { token } = useAuth();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [item, setItem] = useState({ kind: "BONUS", name: "", amount: "", taxable: true });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "delete" | "reopen">(null);

  const load = useCallback(() => {
    if (!token) return;
    Promise.all([api.run(token, id), api.runPayslips(token, id)])
      .then(([r, s]) => {
        setRun(r); setSlips(s);
        setEditing((cur) => (cur ? s.find((x) => x.id === cur.id) ?? null : null));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, id]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); load(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  async function addItem() {
    if (!token || !editing) return;
    const amount = parseFloat(item.amount);
    if (!item.name.trim() || !(amount > 0)) return;
    await act(async () => {
      const s = await api.addPayslipItem(token, editing.id, { ...item, name: item.name.trim(), amount });
      setEditing(s);
      setItem({ kind: "BONUS", name: "", amount: "", taxable: true });
    });
  }

  if (loading) return <Spinner />;
  if (error && !run) return <div className="p-6"><p className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p></div>;
  if (!run || !token) return null;
  const draft = run.status === "DRAFT";

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title={run.label}
        breadcrumb={`Payroll / Runs / ${run.label}`}
        subtitle={`${fmtDate(run.period_start)}, ${fmtDate(run.period_end)}`}
        actions={
          <>
            <Badge status={run.status} />
            {draft && <Button variant="secondary" onClick={() => act(() => api.regenerateRun(token, id))} disabled={busy}>Recalculate</Button>}
            {draft && <Button onClick={() => act(() => api.approveRun(token, id))} disabled={busy}>Approve Run</Button>}
            {run.status === "APPROVED" && <Button variant="secondary" onClick={() => setConfirm("reopen")} disabled={busy}>Re-open</Button>}
            {run.status === "APPROVED" && <Button onClick={() => act(() => api.markPaid(token, id))} disabled={busy}>Mark as Paid</Button>}
            {draft && <Button variant="danger" onClick={() => setConfirm("delete")} disabled={busy}>Delete</Button>}
          </>
        }
      />

      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ["Employees", String(run.payslips_count), "text-ink"],
          ["Gross pay", cedi(run.total_gross), "text-ink"],
          ["SSNIT (employee)", cedi(run.total_ssnit_employee), "text-error"],
          ["PAYE tax", cedi(run.total_paye), "text-error"],
          ["Total net pay", cedi(run.total_net), "text-primary"],
        ].map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-border bg-white p-4">
            <p className="text-xs font-medium text-muted">{l}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">Export:</span>
        {EXPORTS.map(([kind, label]) => (
          <button key={kind}
            onClick={() => downloadFile(`/api/v1/payroll/runs/${id}/export/${kind}.csv`, token, `${kind}_${run.label.replace(/\s+/g, "_")}.csv`).catch((e) => setError(e.message))}
            className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-surface">
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-faint">Employer SSNIT: {cedi(run.total_ssnit_employer)}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-semibold text-muted">
              <th className="px-5 py-3">Employee</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Basic</th>
              <th className="px-4 py-3">Allow.</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">SSNIT</th>
              <th className="px-4 py-3">PAYE</th>
              <th className="px-4 py-3">Other ded.</th>
              <th className="px-4 py-3">Net Pay</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface/60">
                <td className="px-5 py-3">
                  <p className="font-semibold text-ink">{s.employee_name}</p>
                  <p className="text-xs text-faint">{s.employee_code} · {s.position || s.department || ""}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {parseFloat(s.days_payable || "0")}/{parseFloat(s.days_expected || "0")}
                  <span className="block text-faint">{s.days_late}L · {s.days_absent}A · {s.days_leave}Lv</span>
                </td>
                <td className="px-4 py-3 tabular-nums">{cedi(s.basic_pay)}</td>
                <td className="px-4 py-3 tabular-nums text-success">{cedi(parseFloat(s.allowances) + parseFloat(s.overtime_pay || "0"))}</td>
                <td className="px-4 py-3 tabular-nums">{cedi(s.gross_pay)}</td>
                <td className="px-4 py-3 tabular-nums text-error">{cedi(s.ssnit_employee)}</td>
                <td className="px-4 py-3 tabular-nums text-error">{cedi(s.paye)}</td>
                <td className="px-4 py-3 tabular-nums text-error">{cedi(s.deductions)}</td>
                <td className={`px-4 py-3 font-bold tabular-nums ${parseFloat(s.net_pay) < 0 ? "text-error" : "text-primary"}`}>{cedi(s.net_pay)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link href={`/payslips/${s.id}`} className="mr-2 text-xs font-semibold text-primary hover:underline">Payslip</Link>
                  {draft && (
                    <button onClick={() => { setEditing(s); setNotes(s.notes || ""); }} className="text-xs font-semibold text-muted hover:text-ink hover:underline">Adjust</button>
                  )}
                </td>
              </tr>
            ))}
            {slips.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-muted">No active employees fell inside this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={`Adjust, ${editing.employee_name}`} onClose={() => setEditing(null)} wide>
          <div className="mb-4 space-y-1.5">
            {(editing.items ?? []).length === 0 && <p className="text-xs text-muted">No allowances or deductions on this payslip yet.</p>}
            {(editing.items ?? []).map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold text-ink">{i.name}</span>
                  <span className="ml-2 text-[11px] text-faint">{i.kind.toLowerCase()} · {i.source.toLowerCase()}{i.kind !== "DEDUCTION" && i.kind !== "LOAN" && i.kind !== "LATE" ? (i.taxable ? " · taxable" : " · tax-free") : ""}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={`tabular-nums font-semibold ${i.kind === "ALLOWANCE" || i.kind === "BONUS" ? "text-success" : "text-error"}`}>
                    {i.kind === "ALLOWANCE" || i.kind === "BONUS" ? "+" : "−"}{cedi(i.amount)}
                  </span>
                  {i.source === "MANUAL" && (
                    <button onClick={() => act(async () => setEditing(await api.deletePayslipItem(token, editing.id, i.id)))} className="text-xs font-semibold text-error hover:underline">Remove</button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Type">
              <select value={item.kind} onChange={(e) => setItem({ ...item, kind: e.target.value })} className={inputCls}>
                <option value="BONUS">Bonus</option><option value="ALLOWANCE">Allowance</option><option value="DEDUCTION">Deduction</option>
              </select>
            </Field>
            <Field label="Description"><input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} className={inputCls} placeholder="e.g. Sales bonus" /></Field>
            <Field label="Amount (₵)"><input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} className={inputCls} /></Field>
            <Field label="Taxable">
              <select value={item.taxable ? "1" : "0"} disabled={item.kind === "DEDUCTION"} onChange={(e) => setItem({ ...item, taxable: e.target.value === "1" })} className={inputCls}>
                <option value="1">Yes</option><option value="0">No</option>
              </select>
            </Field>
          </div>
          <div className="mt-3 flex justify-end"><Button onClick={addItem} disabled={busy || !item.name.trim() || !(parseFloat(item.amount) > 0)}>Add line</Button></div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface p-3 text-center text-xs">
            <div><p className="text-muted">Gross</p><p className="font-bold text-ink">{cedi(editing.gross_pay)}</p></div>
            <div><p className="text-muted">SSNIT + PAYE</p><p className="font-bold text-error">{cedi(parseFloat(editing.ssnit_employee) + parseFloat(editing.paye))}</p></div>
            <div><p className="text-muted">Net</p><p className="font-bold text-primary">{cedi(editing.net_pay)}</p></div>
          </div>
          <div className="mt-4">
            <Field label="Payslip note"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Close</Button>
            <Button onClick={() => act(async () => { await api.updatePayslip(token, editing.id, { notes }); setEditing(null); })} disabled={busy}>Save note</Button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm === "delete" ? "Delete draft run" : "Re-open run"} onClose={() => setConfirm(null)}>
          <p className="text-sm text-muted">
            {confirm === "delete"
              ? "This permanently removes the draft run and all its payslips."
              : "The run returns to draft and any staff-loan repayments applied at approval are reversed."}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm === "delete" ? "danger" : "primary"} onClick={async () => {
              const c = confirm; setConfirm(null);
              if (c === "delete") { await act(async () => { await api.deleteRun(token, id); router.replace("/payroll"); }); }
              else await act(() => api.reopenRun(token, id));
            }}>Confirm</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
