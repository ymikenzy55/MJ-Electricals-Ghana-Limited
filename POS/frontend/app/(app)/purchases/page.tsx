"use client";

import { useCallback, useEffect, useState } from "react";
import { IconX } from "@/components/Icons";
import { api, ApiError, getStoredUser } from "@/lib/api";
import type { Branch } from "@/lib/types";
import { PageHeader, cedi } from "@/components/ui";

export default function PurchasesPage() {
  return (
    <PurchasesScreen />
  );
}

interface Supplier { id: number; name: string; phone: string | null; email: string | null; is_active: boolean }
interface Purchase {
  id: number; purchase_number: string; supplier_id: number | null; branch_id: number;
  received_by: number; total_cost: string; created_at: string;
  items: { id: number; variant_id: number; quantity: string; unit_cost: string }[];
}
interface VariantLookup { variant_id: number; product_name: string; variant_name: string; sku: string; selling_price: string }

function PurchasesScreen() {
  const user = getStoredUser();
  const [tab, setTab] = useState<"purchases" | "suppliers">("purchases");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Purchase form state
  const [branchId, setBranchId] = useState(user?.branch_id ?? 0);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [scanCode, setScanCode] = useState("");
  const [lines, setLines] = useState<{ variant_id: number; name: string; qty: string; cost: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // Supplier form state
  const [sName, setSName] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sAddress, setSAddress] = useState("");

  const load = useCallback(async () => {
    const [s, p, b] = await Promise.all([
      api<Supplier[]>("/api/v1/suppliers"),
      api<Purchase[]>("/api/v1/purchases", { params: { branch_id: (user?.branch_id ?? branchId) || undefined } }),
      api<Branch[]>("/api/v1/branches"),
    ]);
    setSuppliers(s); setPurchases(p); setBranches(b);
    if (branchId === 0 && user?.branch_id) setBranchId(user.branch_id);
  }, [user?.branch_id, branchId]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function addProduct() {
    if (!scanCode.trim()) return;
    try {
      const v = await api<VariantLookup>("/api/v1/pos/lookup", { params: { code: scanCode, branch_id: branchId } });
      setLines((prev) => [...prev, { variant_id: v.variant_id, name: `${v.product_name} - ${v.variant_name}`, qty: "1", cost: "0" }]);
      setScanCode("");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Not found"); }
  }

  async function createPurchase() {
    setError(null);
    if (lines.length === 0) { setError("Add at least one item"); return; }
    setBusy(true);
    try {
      await api("/api/v1/purchases", {
        method: "POST",
        body: {
          supplier_id: supplierId, branch_id: branchId,
          items: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.qty, unit_cost: l.cost })),
        },
      });
      setShowForm(false); setLines([]); setScanCode(""); setSupplierId(null);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function createSupplier() {
    setError(null);
    try {
      await api("/api/v1/suppliers", { method: "POST", body: { name: sName, phone: sPhone || null, email: sEmail || null, address: sAddress || null } });
      setShowSupplierForm(false); setSName(""); setSPhone(""); setSEmail(""); setSAddress("");
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed"); }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Suppliers & Purchases"
        breadcrumb="Suppliers & Purchases"
        actions={
          <div className="flex rounded border border-[#DADDE6]">
            <button onClick={() => setTab("purchases")} className={`px-4 py-1.5 text-sm font-medium ${tab === "purchases" ? "bg-[#061161] text-white" : "text-[#4A5060] hover:bg-[#FAFAFC]"}`}>Purchases</button>
            <button onClick={() => setTab("suppliers")} className={`px-4 py-1.5 text-sm font-medium ${tab === "suppliers" ? "bg-[#061161] text-white" : "text-[#4A5060] hover:bg-[#FAFAFC]"}`}>Suppliers</button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}

      {tab === "purchases" && (
        <>
          <button onClick={() => setShowForm(!showForm)} className="mb-4 rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C]">
            {showForm ? "Cancel" : "+ Receive Stock"}
          </button>

          {showForm && (
            <div className="mb-6 rounded-xl border border-[#DADDE6] bg-white p-5">
              <div className="mb-4 grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Branch</span>
                  <select value={branchId} onChange={(e) => setBranchId(Number(e.target.value))} disabled={!!user?.branch_id} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm disabled:bg-[#EDEFF9]">
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Supplier (optional)</span>
                  <select value={supplierId ?? ""} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm">
                    <option value="">No supplier</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="mb-3 flex gap-2">
                <input value={scanCode} onChange={(e) => setScanCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProduct(); } }}
                  placeholder="Scan barcode or type SKU" className="flex-1 rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none" />
                <button onClick={addProduct} className="rounded border border-[#DADDE6] px-4 py-2 text-sm hover:bg-[#FAFAFC]">Add</button>
              </div>

              {lines.length > 0 && (
                <table className="mb-4 w-full text-sm">
                  <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                    <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit Cost</th><th></th></tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-t border-[#DADDE6]">
                        <td className="px-3 py-2">{l.name}</td>
                        <td className="px-3 py-2 text-right"><input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} className="w-20 rounded border border-[#DADDE6] px-2 py-1 text-right" /></td>
                        <td className="px-3 py-2 text-right"><input type="number" min={0} step="0.01" value={l.cost} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, cost: e.target.value } : x))} className="w-24 rounded border border-[#DADDE6] px-2 py-1 text-right" /></td>
                        <td className="px-3 py-2 text-center"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-[#6B7183] hover:text-[#C62828]"><IconX className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button onClick={createPurchase} disabled={busy || lines.length === 0} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">
                {busy ? "Saving..." : "Receive Stock"}
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded border border-[#DADDE6] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                <tr><th className="px-4 py-2">PO #</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Items</th><th className="px-4 py-2 text-right">Total Cost</th></tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t border-[#DADDE6]">
                    <td className="px-4 py-2 font-medium text-[#061161]">{p.purchase_number}</td>
                    <td className="px-4 py-2 text-[#4A5060]">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{p.items.length}</td>
                    <td className="px-4 py-2 text-right font-semibold">{cedi(p.total_cost)}</td>
                  </tr>
                ))}
                {purchases.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-[#6B7183]">No purchases yet</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "suppliers" && (
        <>
          <button onClick={() => setShowSupplierForm(!showSupplierForm)} className="mb-4 rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C]">
            {showSupplierForm ? "Cancel" : "+ Add Supplier"}
          </button>

          {showSupplierForm && (
            <div className="mb-6 rounded-xl border border-[#DADDE6] bg-white p-5">
              <div className="grid grid-cols-2 gap-4">
                <label className="block"><span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Name *</span>
                  <input value={sName} onChange={(e) => setSName(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></label>
                <label className="block"><span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Phone</span>
                  <input value={sPhone} onChange={(e) => setSPhone(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></label>
                <label className="block"><span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Email</span>
                  <input value={sEmail} onChange={(e) => setSEmail(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></label>
                <label className="block"><span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Address</span>
                  <input value={sAddress} onChange={(e) => setSAddress(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></label>
              </div>
              <button onClick={createSupplier} disabled={!sName} className="mt-4 rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">Save Supplier</button>
            </div>
          )}

          <div className="overflow-hidden rounded border border-[#DADDE6] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-t border-[#DADDE6]">
                    <td className="px-4 py-2 font-medium text-[#0B0E1A]">{s.name}</td>
                    <td className="px-4 py-2 text-[#4A5060]">{s.phone ?? "-"}</td>
                    <td className="px-4 py-2 text-[#4A5060]">{s.email ?? "-"}</td>
                    <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${s.is_active ? "bg-[#16803C]/15 text-[#16803C]" : "bg-[#C62828]/15 text-[#C62828]"}`}>{s.is_active ? "Active" : "Disabled"}</span></td>
                  </tr>
                ))}
                {suppliers.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-[#6B7183]">No suppliers yet</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

