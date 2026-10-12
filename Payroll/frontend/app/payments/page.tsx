"use client";

import { useCallback, useEffect, useState } from "react";
import { api, cedi, downloadFile, fmtDate, type PaymentList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, PageHeader, Spinner, inputCls } from "@/components/ui";

export default function PaymentsPage() {
  const { token } = useAuth();
  const [period, setPeriod] = useState("");
  const [data, setData] = useState<PaymentList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.payments(token, period || undefined).then((r) => { setData(r); setError(null); }).catch((e) => setError(e.message));
  }, [token, period]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 12000); return () => clearInterval(id); }, [load]);

  async function exportCsv() {
    if (!token) return;
    try { await downloadFile(`/api/v1/payments/export.csv${period ? `?period=${period}` : ""}`, token, `payments${period ? `-${period}` : ""}.csv`); }
    catch (e) { setError(e instanceof Error ? e.message : "Export failed"); }
  }

  return (
    <div className="p-6 lg:p-8">
      <PageHeader title="Payment log" subtitle="Every payment made to workers. Record new ones from the monthly attendance report." actions={<Button variant="secondary" onClick={exportCsv}>Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inputCls} max-w-[12rem]`} aria-label="Month" />
        {period && <button onClick={() => setPeriod("")} className="text-sm font-semibold text-primary">Show all months</button>}
      </div>
      {error && <p className="mb-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
      {!data ? <Spinner /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border p-4"><p className="text-xs text-faint">Total paid</p><p className="text-xl font-black text-ink">{cedi(data.total)}</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-xs text-faint">Payments</p><p className="text-xl font-black text-ink">{data.count}</p></div>
            {Object.entries(data.by_method).map(([m, v]) => <div key={m} className="rounded-xl border border-border p-4"><p className="text-xs text-faint">{m === "MOMO" ? "Mobile money" : m[0] + m.slice(1).toLowerCase()}</p><p className="text-xl font-black text-ink">{cedi(v)}</p></div>)}
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint"><th className="px-4 py-3">Date</th><th className="px-4 py-3">Worker</th><th className="px-4 py-3">For</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
                <tbody>
                  {data.items.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-faint">No payments recorded yet.</td></tr>}
                  {data.items.map((p) => (
                    <tr key={p.id} className="border-b border-border/60">
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(p.paid_at)}</td>
                      <td className="px-4 py-3"><p className="font-semibold text-ink">{p.employee_name}</p><p className="text-xs text-faint">{p.employee_code}</p></td>
                      <td className="px-4 py-3">{p.period}</td>
                      <td className="px-4 py-3">{p.days_attended !== null ? `${parseFloat(p.days_attended)} of ${p.days_total}` : "—"}</td>
                      <td className="px-4 py-3">{p.method}</td>
                      <td className="px-4 py-3 text-muted">{p.reference || p.note || "—"}{p.paid_by ? <span className="block text-xs text-faint">by {p.paid_by}</span> : null}</td>
                      <td className="px-4 py-3 text-right font-bold">{cedi(p.amount)}</td>
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
