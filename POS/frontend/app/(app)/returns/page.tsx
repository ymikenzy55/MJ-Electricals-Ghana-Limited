"use client";

import { useState } from "react";
import { api, ApiError, getStoredUser } from "@/lib/api";
import type { Sale } from "@/lib/types";
import { PageHeader, cedi } from "@/components/ui";

export default function ReturnsPage() {
  return (
    <ReturnsScreen />
  );
}

interface ReturnItemIn { sale_item_id: number; quantity: string; restock: boolean }
interface ReturnResult { return_number: string; total_refund: string }

function ReturnsScreen() {
  const user = getStoredUser();
  const [search, setSearch] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function findSale() {
    setError(null);
    setSale(null);
    setResult(null);
    try {
      const found = await api<Sale>(`/api/v1/sales/${search.trim()}`);
      setSale(found);
      const initRestock: Record<number, boolean> = {};
      found.items.forEach((i) => { initRestock[i.id] = true; });
      setRestock(initRestock);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sale not found");
    }
  }

  async function processReturn() {
    if (!sale) return;
    setError(null);
    const items: ReturnItemIn[] = [];
    for (const si of sale.items) {
      const qty = parseFloat(returnQtys[si.id] || "0");
      if (qty > 0) {
        const available = parseFloat(si.quantity) - parseFloat(si.returned_quantity);
        if (qty > available) {
          setError(`Cannot return ${qty} of ${si.product_name}; only ${available} available`);
          return;
        }
        items.push({ sale_item_id: si.id, quantity: String(qty), restock: restock[si.id] ?? true });
      }
    }
    if (items.length === 0) { setError("Enter a quantity for at least one item"); return; }
    if (reason.length < 3) { setError("Reason must be at least 3 characters"); return; }
    setBusy(true);
    try {
      const res = await api<ReturnResult>("/api/v1/returns", {
        method: "POST",
        body: { sale_id: sale.id, reason, items },
      });
      setResult(res);
      setSale(null);
      setSearch("");
      setReturnQtys({});
      setReason("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Return failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Process Return" breadcrumb="Process Return" />

      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}
      {result && (
        <div className="mb-4 rounded border border-[#16803C]/30 bg-[#16803C]/10 px-3 py-2 text-sm text-[#16803C]">
          Return processed: <strong>{result.return_number}</strong> - Refund: {cedi(result.total_refund)}
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter receipt number or transaction UUID"
          className="flex-1 rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
        />
        <button onClick={findSale} disabled={!search.trim()} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">
          Find Sale
        </button>
      </div>

      {sale && (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
          <div className="mb-4 flex justify-between">
            <div>
              <div className="font-bold text-[#0B0E1A]">{sale.receipt_number}</div>
              <div className="text-sm text-[#4A5060]">{new Date(sale.sold_at).toLocaleString()} Â· {sale.cashier_name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-[#4A5060]">Total: <strong className="text-[#0B0E1A]">{cedi(sale.total)}</strong></div>
              <div className="text-sm text-[#4A5060]">Status: {sale.status}</div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Sold</th>
                <th className="px-3 py-2 text-right">Returned</th>
                <th className="px-3 py-2 text-right">Return Qty</th>
                <th className="px-3 py-2 text-center">Restock?</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((si) => {
                const sold = parseFloat(si.quantity);
                const returned = parseFloat(si.returned_quantity);
                const available = sold - returned;
                return (
                  <tr key={si.id} className="border-t border-[#DADDE6]">
                    <td className="px-3 py-2">
                      <div className="font-medium">{si.product_name}</div>
                      <div className="text-xs text-[#4A5060]">{si.variant_name} Â· {cedi(si.unit_price)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{sold}</td>
                    <td className="px-3 py-2 text-right text-[#4A5060]">{returned}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={available}
                        value={returnQtys[si.id] || ""}
                        onChange={(e) => setReturnQtys({ ...returnQtys, [si.id]: e.target.value })}
                        disabled={available === 0}
                        className="w-20 rounded border border-[#DADDE6] px-2 py-1 text-right disabled:bg-[#EDEFF9]"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={restock[si.id] ?? true}
                        onChange={(e) => setRestock({ ...restock, [si.id]: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-[#0B0E1A]">Reason for return</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
              placeholder="e.g. Customer returned defective bulb"
            />
          </div>

          <button
            onClick={processReturn}
            disabled={busy}
            className="mt-4 rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50"
          >
            {busy ? "Processing..." : "Process Return"}
          </button>
        </div>
      )}
    </div>
  );
}

