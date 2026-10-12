"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getStoredUser } from "@/lib/api";
import type { Branch, InventoryRow, Paginated } from "@/lib/types";
import { PageHeader, Pagination, cedi } from "@/components/ui";

export default function InventoryPage() {
  return (
    <InventoryList />
  );
}

function InventoryList() {
  const user = getStoredUser();
  const canAdjust = user?.permissions.includes("inventory.adjust") ?? false;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(user?.branch_id ?? null);
  const [data, setData] = useState<Paginated<InventoryRow> | null>(null);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adjustRow, setAdjustRow] = useState<InventoryRow | null>(null);
  const [adjType, setAdjType] = useState("ADJUSTMENT");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjBusy, setAdjBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (b: number, q: string, low: boolean, p: number) => {
      setLoading(true);
      try {
        const res = await api<Paginated<InventoryRow>>("/api/v1/inventory", {
          params: { branch_id: b, search: q || undefined, low_stock_only: low, page: p, page_size: 25 },
        });
        setData(res);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    api<Branch[]>("/api/v1/branches")
      .then((bs) => {
        setBranches(bs);
        const b = user?.branch_id ?? bs[0]?.id ?? null;
        setBranchId(b);
        if (b !== null) load(b, "", false, 1).catch(() => null);
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh(b = branchId, q = search, low = lowOnly, p = page) {
    if (b !== null) load(b, q, low, p).catch(() => null);
  }

  async function doAdjust() {
    if (!adjustRow || branchId === null) return;
    setAdjError(null);
    const qty = parseFloat(adjQty);
    if (!qty) { setAdjError("Enter a quantity change (positive or negative)"); return; }
    setAdjBusy(true);
    try {
      await api("/api/v1/inventory/adjust", {
        method: "POST",
        body: {
          variant_id: adjustRow.variant_id, branch_id: branchId,
          quantity_change: adjQty, movement_type: adjType,
          reason: adjReason.trim() || null,
        },
      });
      setAdjustRow(null); setAdjQty(""); setAdjReason(""); setAdjType("ADJUSTMENT");
      refresh();
    } catch (e) { setAdjError(e instanceof ApiError ? e.message : "Adjustment failed"); }
    finally { setAdjBusy(false); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const lockedToBranch = user?.branch_id !== null && user?.branch_id !== undefined;

  return (
    <div className="p-6">
      <PageHeader
        title="Inventory"
        breadcrumb="Inventory"
        actions={
          <>
            <select
              value={branchId ?? ""}
              disabled={lockedToBranch}
              onChange={(e) => {
                const b = Number(e.target.value);
                setBranchId(b);
                setPage(1);
                refresh(b, search, lowOnly, 1);
              }}
              className="rounded border border-[#DADDE6] bg-white px-3 py-2 text-sm disabled:bg-[#EDEFF9]"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-[#4A5060]">
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => {
                  setLowOnly(e.target.checked);
                  setPage(1);
                  refresh(branchId, search, e.target.checked, 1);
                }}
              />
              Low stock only
            </label>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => refresh(branchId, e.target.value, lowOnly, 1), 300);
              }}
              placeholder="Search..."
              className="w-64 rounded border border-[#DADDE6] bg-white px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
            />
          </>
        }
      />
      <div className="overflow-hidden rounded border border-[#DADDE6] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
            <tr>
              <th className="px-4 py-2 w-16">Image</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Barcode</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">Stock</th>
              <th className="px-4 py-2 text-right">Reorder level</th>
              <th className="px-4 py-2">Status</th>
              {canAdjust && <th className="px-4 py-2">Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-t border-[#DADDE6]">
                  <td className="px-4 py-3"><div className="h-12 w-12 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-12 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-12 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  <td className="px-4 py-3"><div className="h-5 w-16 animate-pulse rounded-full bg-[#DADDE6]" /></td>
                  {canAdjust && <td className="px-4 py-3"><div className="h-6 w-16 animate-pulse rounded-full bg-[#DADDE6]" /></td>}
                </tr>
              ))
            )}
            {!loading && data?.items.map((r) => (
              <tr key={r.variant_id} className="border-t border-[#DADDE6]">
                <td className="px-4 py-2">
                  <div className="h-12 w-12 overflow-hidden rounded-xl border border-[#DADDE6] bg-[#EDEFF9]">
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt={r.product_name}
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#6B7183]">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-[#0B0E1A]">{r.product_name}</div>
                  <div className="text-xs text-[#4A5060]">{r.variant_name}</div>
                </td>
                <td className="px-4 py-2 text-[#4A5060]">{r.sku}</td>
                <td className="px-4 py-2 text-[#4A5060]">{r.barcode ?? "-"}</td>
                <td className="px-4 py-2 text-right">{cedi(r.selling_price)}</td>
                <td className="px-4 py-2 text-right font-medium">{parseFloat(r.quantity)} {r.unit}</td>
                <td className="px-4 py-2 text-right text-[#4A5060]">{parseFloat(r.reorder_level)}</td>
                <td className="px-4 py-2">
                  {r.low_stock ? (
                    <span className="rounded-full bg-[#C62828]/15 px-2 py-0.5 text-xs font-medium text-[#C62828]">Low stock</span>
                  ) : (
                    <span className="rounded-full bg-[#16803C]/15 px-2 py-0.5 text-xs font-medium text-[#16803C]">OK</span>
                  )}
                </td>
                {canAdjust && (
                  <td className="px-4 py-2">
                    <button onClick={() => { setAdjustRow(r); setAdjError(null); setAdjQty(""); setAdjReason(""); setAdjType("ADJUSTMENT"); }} className="rounded border border-[#DADDE6] px-2 py-1 text-xs font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]">
                      Adjust
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!loading && data && data.items.length === 0 && (
              <tr><td colSpan={canAdjust ? 9 : 8} className="px-4 py-10 text-center text-[#6B7183]">No inventory records</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && pages > 1 && (
        <Pagination
          page={page}
          pages={pages}
          onPage={(p) => { setPage(p); refresh(branchId, search, lowOnly, p); }}
        />
      )}

      {adjustRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-[#0B0E1A]">Adjust Stock</h2>
            <p className="mb-4 text-sm text-[#4A5060]">
              {adjustRow.product_name} - {adjustRow.variant_name} (current: {parseFloat(adjustRow.quantity)} {adjustRow.unit})
            </p>
            {adjError && <div className="mb-3 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{adjError}</div>}
            <label className="mb-1 block text-sm font-medium text-[#0B0E1A]">Type</label>
            <select value={adjType} onChange={(e) => setAdjType(e.target.value)} className="mb-3 w-full rounded border border-[#DADDE6] px-3 py-2 text-sm">
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="OPENING">Opening Stock</option>
              <option value="DAMAGED">Damaged</option>
              <option value="CORRECTION">Correction</option>
            </select>
            <label className="mb-1 block text-sm font-medium text-[#0B0E1A]">Quantity change (+ or -)</label>
            <input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} placeholder="e.g. 5 or -3" className="mb-3 w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
            <label className="mb-1 block text-sm font-medium text-[#0B0E1A]">Reason <span className="font-normal text-[#6B7183]">(optional)</span></label>
            <textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} rows={2} className="mb-4 w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={doAdjust} disabled={adjBusy} className="flex-1 rounded-full bg-[#061161] py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">{adjBusy ? "Saving..." : "Save Adjustment"}</button>
              <button onClick={() => setAdjustRow(null)} className="rounded border border-[#DADDE6] px-4 py-2 text-sm font-medium hover:bg-[#FAFAFC]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

