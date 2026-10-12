"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, type Payslip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PayslipView from "@/components/PayslipView";
import { Spinner } from "@/components/ui";

export default function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.payslip(token, id).then(setSlip).catch((e) => setError(e.message));
  }, [token, id]);

  if (!token) return <Spinner />;
  if (error) return <div className="p-6"><p className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p></div>;
  if (!slip) return <Spinner label="Loading payslip…" />;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/payroll/${slip.run_id}`} className="text-sm font-semibold text-primary hover:underline">← Back to run</Link>
        <button onClick={() => window.print()} className="rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover">
          Print / Save PDF
        </button>
      </div>
      <PayslipView slip={slip} />
    </div>
  );
}
