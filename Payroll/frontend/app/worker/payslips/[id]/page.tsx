"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, type Payslip } from "@/lib/api";
import { getWorkerToken } from "@/lib/worker";
import PayslipView from "@/components/PayslipView";

export default function WorkerPayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getWorkerToken();
    if (!t) { window.location.href = "/worker"; return; }
    api.workerPayslip(t, id).then(setSlip).catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="min-h-screen bg-surface p-4 sm:p-6">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between print:hidden">
        <Link href="/worker/payslips" className="text-sm font-semibold text-primary hover:underline">← My payslips</Link>
        <button onClick={() => window.print()} className="rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-white">Print / Save PDF</button>
      </div>
      {error && <p className="mx-auto max-w-2xl rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}
      {!slip && !error && <p className="text-center text-sm text-muted">Loading…</p>}
      {slip && <PayslipView slip={slip} />}
    </div>
  );
}
