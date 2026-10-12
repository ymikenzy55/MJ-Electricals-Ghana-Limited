"use client";

import { useCallback, useEffect, useState } from "react";
import { IconX } from "@/components/Icons";
import { api, ApiError, getStoredUser } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import type { Branch } from "@/lib/types";

export default function TransfersPage() {
  return (
    <TransfersScreen />
  );
}

interface TransferItem { variant_id: number; quantity: string }
interface Transfer {
  id: number; transfer_number: string; from_branch_id: number; to_branch_id: number;
  status: string; requested_by: number; notes: string | null; created_at: string;
  items: { id: number; variant_id: number; quantity: string }[];
}
interface VariantLookup {
  variant_id: number; product_name: string; variant_name: string; sku: string; selling_price: string; available_quantity: string;
}

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "bg-[#EDEFF9] text-[#0B0E1A]",
  APPROVED: "bg-[#E0E4F5] text-[#061161]",
  DISPATCHED: "bg-[#B7791F]/15 text-[#B7791F]",
  RECEIVED: "bg-[#16803C]/15 text-[#16803C]",
  CANCELLED: "bg-[#C62828]/15 text-[#C62828]",
};

function TransfersScreen() {
  const user = getStoredUser();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fromBranch, setFromBranch] = useState(user?.branch_id ?? 0);
  const [toBranch, setToBranch] = useState(0);
  const [notes, setNotes] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [lines, setLines] = useState<{ variant_id: number; name: string; sku: string; qty: number; available: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [bs, ts] = await Promise.all([
      api<Branch[]>("/api/v1/branches"),
      api<Transfer[]>("/api/v1/transfers", { params: { branch_id: user?.branch_id ?? undefined } }),
    ]);
    setBranches(bs);
    setTransfers(ts);
    if (fromBranch === 0 && user?.branch_id) setFromBranch(user.branch_id);
    if (toBranch === 0 && bs.length > 0) setToBranch(bs.find((b) => b.id !== (user?.branch_id ?? fromBranch))?.id ?? 0);
  }, [user?.branch_id, fromBranch, toBranch]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function addProduct() {
    if (!scanCode.trim() || !fromBranch) return;
    try {
      const v = await api<VariantLookup>("/api/v1/pos/lookup", { params: { code: scanCode, branch_id: fromBranch } });
      setLines((prev) => [...prev, {
        variant_id: v.variant_id, name: `${v.product_name} - ${v.variant_name}`,
        sku: v.sku, qty: 1, available: parseFloat(v.available_quantity),
      }]);
      setScanCode("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Product not found");
    }
  }

  async function createTransfer() {
    setError(null);
    if (fromBranch === toBranch) { setError("Source and destination must differ"); return; }
    if (lines.length === 0) { setError("Add at least one item"); return; }
    setBusy(true);
    try {
      await api("/api/v1/transfers", {
        method: "POST",
        body: {
          from_branch_id: fromBranch, to_branch_id: toBranch, notes,
          items: lines.map((l) => ({ variant_id: l.variant_id, quantity: String(l.qty) })),
        },
      });
      setShowForm(false); setLines([]); setNotes(""); setScanCode("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create transfer");
    } finally {
      setBusy(false);
    }
  }

  async function actionTransfer(id: number, action: string) {
    setError(null);
    try {
      await api(`/api/v1/transfers/${id}/${action}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Failed to ${action} transfer`);
    }
  }

  const branchName = (id: number) => branches.find((b) => b.id === id)?.name ?? `Branch ${id}`;

  return (
    <div className="min-h-full">
      <PageHeader
        title="Stock Transfers"
        breadcrumb="Stock Transfers"
        actions={
          <button onClick={() => setShowForm(!showForm)} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C]">
            {showForm ? "Cancel" : "+ New Transfer"}
          </button>
        }
      />
      <div className="p-6">
      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}

      {showForm && (
        <div className="mb-6 rounded-xl border border-[#DADDE6] bg-white p-5">
          <div className="mb-4 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">From branch</span>
              <select value={fromBranch} onChange={(e) => setFromBranch(Number(e.target.value))} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">To branch</span>
              <select value={toBranch} onChange={(e) => setToBranch(Number(e.target.value))} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mb-3 flex gap-2">
            <input
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProduct(); } }}
              placeholder="Scan barcode or type SKU to add item"
              className="flex-1 rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
            />
            <button onClick={addProduct} className="rounded border border-[#DADDE6] px-4 py-2 text-sm font-medium hover:bg-[#FAFAFC]">Add</button>
          </div>

          {lines.length > 0 && (
            <table className="mb-4 w-full text-sm">
              <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-right">Qty</th><th></th></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-[#DADDE6]">
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 text-right text-[#4A5060]">{l.available}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={1} max={l.available} value={l.qty}
                        onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Math.min(Math.max(1, parseInt(e.target.value) || 1), x.available) } : x))}
                        className="w-20 rounded border border-[#DADDE6] px-2 py-1 text-right" />
                    </td>
                    <td className="px-3 py-2 text-center"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-[#6B7183] hover:text-[#C62828]"><IconX className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)"
            className="mb-3 w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none" />

          <button onClick={createTransfer} disabled={busy || lines.length === 0}
            className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">
            {busy ? "Creating..." : "Create Transfer Request"}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded border border-[#DADDE6] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
            <tr>
              <th className="px-4 py-2">Transfer #</th>
              <th className="px-4 py-2">From</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2">Items</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} className="border-t border-[#DADDE6]">
                <td className="px-4 py-2 font-medium text-[#061161]">{t.transfer_number}</td>
                <td className="px-4 py-2">{branchName(t.from_branch_id)}</td>
                <td className="px-4 py-2">{branchName(t.to_branch_id)}</td>
                <td className="px-4 py-2">{t.items.length}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? ""}`}>{t.status}</span>
                </td>
                <td className="px-4 py-2 text-[#4A5060]">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 space-x-1">
                  {t.status === "REQUESTED" && (
                    <>
                      <button onClick={() => actionTransfer(t.id, "approve")} className="rounded-full bg-[#E0E4F5] px-2 py-1 text-xs font-medium text-[#061161] hover:bg-[#DDE2F5]">Approve</button>
                      <button onClick={() => actionTransfer(t.id, "cancel")} className="rounded-full bg-[#C62828]/15 px-2 py-1 text-xs font-medium text-[#C62828] hover:bg-[#C62828]/30">Cancel</button>
                    </>
                  )}
                  {t.status === "APPROVED" && (
                    <button onClick={() => actionTransfer(t.id, "dispatch")} className="rounded-full bg-[#B7791F]/15 px-2 py-1 text-xs font-medium text-[#B7791F] hover:bg-[#B7791F]/30">Dispatch</button>
                  )}
                  {t.status === "DISPATCHED" && (
                    <button onClick={() => actionTransfer(t.id, "receive")} className="rounded-full bg-[#16803C]/15 px-2 py-1 text-xs font-medium text-[#16803C] hover:bg-[#16803C]/30">Receive</button>
                  )}
                </td>
              </tr>
            ))}
            {transfers.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#6B7183]">No transfers yet</td></tr>}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

