"use client";

import { useEffect, useState } from "react";
import { api, type AuditEntry } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, EmptyState, PageHeader, Spinner, inputCls } from "@/components/ui";

export default function AuditPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => {
      api.auditLogs(token, q || undefined).then((r) => { setRows(r); setError(null); })
        .catch((e) => setError(e.message)).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [token, q]);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Audit Trail" breadcrumb="Payroll / Audit" subtitle="Every sensitive change, who did what, and when" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions or details…" className={`${inputCls} mb-5 max-w-sm`} />
      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="Nothing logged yet" /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-semibold text-muted">
                <th className="pb-2 pr-4">When</th><th className="pb-2 pr-4">Action</th><th className="pb-2 pr-4">Actor</th><th className="pb-2">Details</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap py-2 pr-4 text-xs text-muted">{new Date(r.created_at).toLocaleString("en-GH")}</td>
                    <td className="py-2 pr-4"><span className="rounded bg-surface px-2 py-0.5 text-[11px] font-bold text-ink">{r.action}</span> <span className="text-xs text-faint">{r.entity_type}</span></td>
                    <td className="py-2 pr-4 text-xs text-muted">{r.actor}</td>
                    <td className="py-2 text-xs text-ink">{r.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
