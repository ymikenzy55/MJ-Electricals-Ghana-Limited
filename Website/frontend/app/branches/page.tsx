"use client";

import { useEffect, useState } from "react";
import { api, type Branch } from "@/lib/api";
import { Spinner, ErrorBox, EmptyState } from "@/components/ui";
import FindUs from "@/components/FindUs";

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.branches().then(setBranches).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-7 sm:py-12 sm:px-6">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Find a Branch</h1>
      <p className="mt-1 text-sm text-muted">Visit us in person, all branches offer pickup for online orders.</p>

      <FindUs heading="Head office on the map" className="mt-6" />

      <h2 className="mt-8 text-lg font-black text-ink">All branches</h2>
      <div className="mt-4">
        {loading ? (
          <Spinner label="Loading branches…" />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : branches.length === 0 ? (
          <EmptyState title="No branches listed yet" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-ink">{b.name}</h2>
                    <p className="text-xs text-faint">{b.code}</p>
                  </div>
                </div>
                {b.address && <p className="mt-3 text-sm text-muted">{b.address}</p>}
                {b.phone && (
                  <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
                    {b.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
