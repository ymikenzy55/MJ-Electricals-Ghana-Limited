"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, cedi, fmtDate, type Payslip } from "@/lib/api";
import { getWorkerToken } from "@/lib/worker";

export default function WorkerPayslipsPage() {
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const token = getWorkerToken();
    if (!token) { window.location.href = "/worker"; return; }
    api.workerPayslips(token).then(setSlips).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  return (
    <main className="min-h-screen bg-[#061161] px-5 py-8 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/worker/home" className="text-sm text-white/60 hover:text-white">← Back to portal</Link>
        <h1 className="mt-6 text-2xl font-black">My payslips</h1>
        <div className="mt-6 space-y-3">
          {loaded && slips.length === 0 && <p className="text-sm text-white/60">No approved payslips yet.</p>}
          {slips.map((s) => (
            <Link key={s.id} href={`/worker/payslips/${s.id}`} className="block rounded-xl bg-white/10 p-4 hover:bg-white/15">
              <div className="flex justify-between">
                <span className="font-semibold">{s.run_label || fmtDate(s.created_at)}</span>
                <span className="font-black text-emerald-300">{cedi(s.net_pay)}</span>
              </div>
              <p className="mt-1 text-xs text-white/60">{fmtDate(s.period_start)}, {fmtDate(s.period_end)} · {s.run_status}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
