"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, getStoredUser } from "@/lib/api";
import type { Branch, InventoryRow, Paginated } from "@/lib/types";
import { Alert, Button, EmptyState, PageHeader, Pagination, TableShell, Td, Th } from "@/components/ui";

const PAGE = 50;

/**
 * Stock take: count what is physically on the shelf, see the differences
 * against the system, and post them as CORRECTION movements in one go.
 * Counts are kept while you page and search, so a large count can be done in
 * sittings; nothing changes in inventory until you press "Apply".
 */
export default function StockTakePage() {
  const user = getStoredUser();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(user?.branch_id ?? null);
  const [data, setData] = useState<Paginated<InventoryRow> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [known, setKnown] = useState<Record<number, InventoryRow>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (b: number, q: string, p: number) => {
    const res = await api<Paginated<InventoryRow>>("/api/v1/inventory", { params: { branch_id: b, search: q || undefined, page: p, page_size: PAGE } });
    setData(res);
    setKnown((k) => ({ ...k, ...Object.fromEntries(res.items.map((r) => [r.variant_id, r])) }));
  }, []);

  useEffect(() => {
    api<Branch[]>("/api/v1/branches").then((bs) => {
      setBranches(bs);
      setBranchId((cur) => cur ?? bs[0]?.id ?? null);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (branchId !== null) load(branchId, search, page).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load stock"));
  }, [branchId, page, load]); // search handled by debounce below
  // eslint-disable-next-line react-hooks/exhaustive-deps

  function onSearch(v: string) {
    setSearch(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); if (branchId !== null) load(branchId, v, 1).catch(() => {}); }, 250);
  }

  const diffs = useMemo(
    () => Object.entries(counts)
      .map(([id, raw]) => {
        const row = known[Number(id)];
        const counted = parseFloat(raw);
        if (!row || raw === "" || Number.isNaN(counted)) return null;
        const change = counted - parseFloat(row.quantity);
        return change === 0 ? null : { row, counted, change };
      })
      .filter((x): x is { row: InventoryRow; counted: number; change: number } => x !== null),
    [counts, known],
  );

  async function apply() {
    if (branchId === null) return;
    setBusy(true); setError(null); setDone(null);
    let ok = 0;
    const failed: string[] = [];
    for (const d of diffs) {
      try {
        await api("/api/v1/inventory/adjust", {
          method: "POST",
          body: { variant_id: d.row.variant_id, branch_id: branchId, quantity_change: d.change.toString(), movement_type: "CORRECTION", reason: `Stock take: counted ${d.counted}` },
        });
        ok++;
        setCounts((c) => { const n = { ...c }; delete n[d.row.variant_id]; return n; });
      } catch (e) {
        failed.push(`${d.row.product_name} (${e instanceof ApiError ? e.message : "failed"})`);
      }
    }
    setBusy(false); setConfirming(false);
    setDone(`${ok} adjustment${ok === 1 ? "" : "s"} applied.`);
    if (failed.length) setError(`Could not adjust: ${failed.join("; ")}`);
    if (branchId !== null) load(branchId, search, page).catch(() => {});
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const surplus = diffs.filter((d) => d.change > 0).length;

  return (
    <div className="min-h-full bg-[#EDEFF9]">
      <PageHeader title="Stock Take" breadcrumb="Inventory / Stock Take" subtitle="Enter the quantity you counted on the shelf. Only items you fill in are adjusted."
        actions={<Button disabled={diffs.length === 0 || busy} onClick={() => setConfirming(true)}>Review &amp; apply ({diffs.length})</Button>} />
      <div className="space-y-4 p-4 sm:p-6">
        {error && <Alert>{error}</Alert>}
        {done && <Alert tone="green">{done}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          {user?.branch_id === null && (
            <select value={branchId ?? ""} onChange={(e) => { setBranchId(parseInt(e.target.value)); setPage(1); setCounts({}); }} className="rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search name, SKU or barcode…" className="w-72 rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm" autoFocus />
          <span className="text-xs text-[#4A5060]">{Object.values(counts).filter((v) => v !== "").length} counted · {diffs.length} differ ({surplus} over, {diffs.length - surplus} short)</span>
        </div>

        {!data ? <EmptyState message="Loading…" /> : data.items.length === 0 ? (
          <div className="rounded-xl border border-[#DADDE6] bg-white"><EmptyState message="No products found." /></div>
        ) : (
          <>
            <TableShell>
              <table className="w-full">
                <thead><tr><Th>Product</Th><Th>SKU</Th><Th className="text-right">System</Th><Th className="w-40 text-right">Counted</Th><Th className="text-right">Difference</Th></tr></thead>
                <tbody>
                  {data.items.map((r) => {
                    const raw = counts[r.variant_id] ?? "";
                    const diff = raw === "" ? null : parseFloat(raw) - parseFloat(r.quantity);
                    return (
                      <tr key={r.variant_id}>
                        <Td><div className="font-medium">{r.product_name}</div><div className="text-xs text-[#6B7183]">{r.variant_name}</div></Td>
                        <Td className="font-mono text-xs">{r.sku}</Td>
                        <Td className="text-right tabular-nums">{parseFloat(r.quantity)}</Td>
                        <Td className="text-right">
                          <input type="number" min="0" step="any" inputMode="decimal" value={raw}
                            onChange={(e) => setCounts((c) => ({ ...c, [r.variant_id]: e.target.value }))}
                            className="w-28 rounded-xl border border-[#DADDE6] px-3 py-1.5 text-right text-sm tabular-nums focus:border-[#061161] focus:outline-none" aria-label={`Counted quantity for ${r.product_name}`} />
                        </Td>
                        <Td className={`text-right font-semibold tabular-nums ${diff === null || diff === 0 ? "text-[#6B7183]" : diff > 0 ? "text-[#16803C]" : "text-[#C62828]"}`}>{diff === null ? "—" : diff > 0 ? `+${diff}` : diff}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
            {pages > 1 && <Pagination page={page} pages={pages} onPage={setPage} />}
          </>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setConfirming(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Apply {diffs.length} stock correction{diffs.length === 1 ? "" : "s"}?</h3>
            <p className="mt-1 text-sm text-[#4A5060]">Each is recorded as a CORRECTION movement in the audit trail.</p>
            <ul className="mt-4 divide-y divide-[#DADDE6] rounded-xl border border-[#DADDE6] text-sm">
              {diffs.map((d) => (
                <li key={d.row.variant_id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0 truncate">{d.row.product_name} <span className="text-xs text-[#6B7183]">{d.row.variant_name}</span></span>
                  <span className="shrink-0 tabular-nums text-xs text-[#4A5060]">{parseFloat(d.row.quantity)} → <b className="text-[#0B0E1A]">{d.counted}</b> <span className={d.change > 0 ? "text-[#16803C]" : "text-[#C62828]"}>({d.change > 0 ? "+" : ""}{d.change})</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Back</Button>
              <Button disabled={busy} onClick={apply}>{busy ? "Applying…" : "Apply corrections"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
