"use client";

import { cedi, fmtDate, type Payslip } from "@/lib/api";

const num = (v: string | number | null | undefined) => parseFloat(String(v ?? 0)) || 0;

/** Printable, itemised payslip shared by the admin and worker portals. */
export default function PayslipView({ slip }: { slip: Payslip }) {
  const items = slip.items ?? [];
  const earnings = items.filter((i) => i.kind === "ALLOWANCE" || i.kind === "BONUS");
  const others = items.filter((i) => i.kind !== "ALLOWANCE" && i.kind !== "BONUS");

  const Row = ({ label, value, tone = "" }: { label: string; value: number; tone?: string }) => (
    <tr className="border-b border-border">
      <td className="py-2 text-ink">{label}</td>
      <td className={`py-2 text-right tabular-nums ${tone}`}>{cedi(value)}</td>
    </tr>
  );

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-white p-8 print:border-0 print:p-0">
      <div className="flex items-start justify-between border-b-2 border-primary pb-5">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MJ_Logo.jpg" alt="" className="h-9 w-9 rounded-lg" />
          <div>
            <p className="text-sm font-black uppercase text-primary">{slip.company_name || "MJ Electricals Ghana Limited"}</p>
            {slip.company_address && <p className="text-[10px] text-muted">{slip.company_address}</p>}
            {slip.company_tin && <p className="text-[10px] text-faint">TIN: {slip.company_tin}</p>}
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-black text-ink">PAYSLIP</h1>
          <p className="text-xs text-muted">{slip.run_label}</p>
          <p className="text-xs text-faint">{fmtDate(slip.period_start)}, {fmtDate(slip.period_end)}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold text-muted">Employee</p>
          <p className="font-bold text-ink">{slip.employee_name}</p>
          <p className="text-xs text-faint">{slip.employee_code}</p>
          {slip.ssnit_number && <p className="text-xs text-faint">SSNIT: {slip.ssnit_number}</p>}
          {slip.tin_number && <p className="text-xs text-faint">TIN: {slip.tin_number}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-muted">Position / Department</p>
          <p className="font-semibold text-ink">{slip.position || "—"}</p>
          <p className="text-xs text-faint">{slip.department || "—"}</p>
          <p className="mt-1 text-xs text-faint">
            Paid by {(slip.payment_method || "BANK").toLowerCase()}
            {slip.bank_name ? ` · ${slip.bank_name}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        {[
          ["Present", slip.days_present, "text-success"],
          ["Late", slip.days_late, "text-warning"],
          ["Absent", slip.days_absent, "text-error"],
          ["Leave", slip.days_leave, "text-info"],
          ["Holiday", slip.days_holiday ?? 0, "text-info"],
          ["Payable", num(slip.days_payable), "text-primary"],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-lg bg-surface py-2">
            <p className={`text-base font-bold tabular-nums ${c}`}>{v}</p>
            <p className="text-[10px] font-semibold text-muted">{l}</p>
          </div>
        ))}
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold text-muted">
            <th className="pb-2">Earnings</th>
            <th className="pb-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <Row label={`Basic pay (${num(slip.days_payable)} of ${num(slip.days_expected)} days)`} value={num(slip.basic_pay)} />
          {earnings.map((i) => <Row key={i.id} label={i.name} value={num(i.amount)} tone="text-success" />)}
          {num(slip.overtime_pay) > 0 && <Row label={`Overtime (${num(slip.overtime_hours)} hrs)`} value={num(slip.overtime_pay)} tone="text-success" />}
          <tr className="border-b border-border bg-surface/60">
            <td className="py-2 font-semibold text-ink">Gross pay</td>
            <td className="py-2 text-right font-bold tabular-nums">{cedi(slip.gross_pay)}</td>
          </tr>
        </tbody>
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold text-muted">
            <th className="pb-2 pt-4">Deductions</th>
            <th className="pb-2 pt-4 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <Row label="SSNIT, employee contribution" value={num(slip.ssnit_employee)} tone="text-error" />
          <Row label={`PAYE income tax (taxable ${cedi(num(slip.taxable_income))})`} value={num(slip.paye)} tone="text-error" />
          {others.map((i) => <Row key={i.id} label={i.name} value={num(i.amount)} tone="text-error" />)}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-4 text-base font-black text-ink">NET PAY</td>
            <td className="pt-4 text-right text-xl font-black tabular-nums text-primary">{cedi(slip.net_pay)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-3 text-[11px] text-faint">Employer SSNIT contribution (not deducted from you): {cedi(slip.ssnit_employer)}</p>
      {slip.notes && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">Note: {slip.notes}</p>}

      <div className="mt-8 flex justify-between text-xs text-faint">
        <span>Generated {fmtDate(slip.created_at)}</span>
        <span>Status: {slip.run_status}</span>
      </div>
      <div className="mt-8 flex justify-between border-t border-border pt-6 text-xs text-muted">
        <div className="w-40 border-t border-ink pt-1.5 text-center">Employee Signature</div>
        <div className="w-40 border-t border-ink pt-1.5 text-center">Authorised By</div>
      </div>
    </div>
  );
}
