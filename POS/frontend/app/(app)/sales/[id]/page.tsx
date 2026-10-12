"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { IconPrint } from "@/components/Icons";
import { api, ApiError, getStoredUser } from "@/lib/api";
import type { Sale } from "@/lib/types";
import { cedi } from "@/components/ui";

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SaleDetail saleId={Number(id)} />;
}

function SaleDetail({ saleId }: { saleId: number }) {
  const user = getStoredUser();
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  // The list page passes returnTo so "Back" restores the exact filtered view
  // the user came from instead of always landing on the main history page.
  const [returnTo] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("returnTo");
      if (p && p.startsWith("/") && !p.startsWith("//")) return p;
    }
    return "/sales";
  });

  useEffect(() => {
    api<Sale>(`/api/v1/sales/by-id/${saleId}`)
      .then((s) => setSale(s))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load sale"))
      .finally(() => setLoading(false));
  }, [saleId]);

  async function voidSale() {
    setVoiding(true);
    setError(null);
    try {
      const updated = await api<Sale>(`/api/v1/sales/by-id/${saleId}/void`, { method: "POST" });
      setSale(updated);
      setShowVoidConfirm(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to void sale");
    } finally {
      setVoiding(false);
    }
  }

  const canVoid = user?.permissions.includes("sales.void") ?? false;

  // 12-hour date format
  const fmt12 = (iso: string) => new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  if (loading) {
    return <div className="p-8 text-[#4A5060]">Loading sale…</div>;
  }

  if (error || !sale) {
    return (
      <div className="p-8">
        <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-4 py-3 text-sm text-[#C62828]">
          {error ?? "Sale not found"}
        </div>
        <Link href={returnTo} className="text-sm font-medium text-[#061161] hover:underline">
          ← Back to Sales
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    COMPLETED: "bg-[#16803C]/15 text-[#16803C]",
    RETURNED: "bg-[#B7791F]/15 text-[#B7791F]",
    PARTIALLY_RETURNED: "bg-[#B7791F]/15 text-[#B7791F]",
    VOIDED: "bg-[#C62828]/15 text-[#C62828]",
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={returnTo}
            className="flex items-center gap-1.5 rounded-xl border border-[#DADDE6] bg-white px-3 py-1.5 text-sm font-medium text-[#0B0E1A] shadow-sm hover:bg-[#FAFAFC]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/sales" className="font-medium text-[#061161] hover:underline">Sales History</Link>
            {returnTo !== "/sales" && (
              <>
                <span className="text-[#6B7183]">/</span>
                <Link href={returnTo} className="font-medium text-[#061161] hover:underline">Sales List</Link>
              </>
            )}
            <span className="text-[#6B7183]">/</span>
            <span className="font-medium text-[#0B0E1A]">{sale.receipt_number}</span>
          </nav>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[sale.status] ?? "bg-[#EDEFF9] text-[#4A5060]"}`}>
            {sale.status.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded border border-[#DADDE6] px-4 py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
          >
            <IconPrint className="h-4 w-4" />
            Print Receipt
          </button>
          {canVoid && sale.status !== "VOIDED" && sale.status !== "RETURNED" && sale.status !== "PARTIALLY_RETURNED" && (
            <button
              onClick={() => setShowVoidConfirm(true)}
              className="rounded border border-[#C62828]/40 px-4 py-2 text-sm font-medium text-[#C62828] hover:bg-[#C62828]/10"
            >
              Void Sale
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Receipt */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-[#DADDE6] bg-white p-6">
            <div className="mb-4 text-center">
              <div className="text-lg font-bold text-[#061161]">MJ Electricals Ghana Ltd</div>
              <div className="text-xs text-[#4A5060]">Receipt {sale.receipt_number}</div>
              <div className="text-xs text-[#4A5060]">
                {fmt12(sale.sold_at)}
              </div>
            </div>

            <div className="my-4 border-t border-dashed border-[#DADDE6]" />

            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[#4A5060]">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit Price</th>
                  <th className="py-2 text-right">Line Total</th>
                  <th className="py-2 text-right">Returned</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((i) => (
                  <tr key={i.id} className="border-t border-[#DADDE6]">
                    <td className="py-2">
                      <div className="font-medium text-[#0B0E1A]">{i.product_name}</div>
                      <div className="text-xs text-[#4A5060]">{i.variant_name} · {i.sku}</div>
                    </td>
                    <td className="py-2 text-right">{parseFloat(i.quantity)}</td>
                    <td className="py-2 text-right">{cedi(i.unit_price)}</td>
                    <td className="py-2 text-right font-medium">{cedi(i.line_total)}</td>
                    <td className="py-2 text-right text-[#4A5060]">
                      {parseFloat(i.returned_quantity) > 0 ? parseFloat(i.returned_quantity) : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="my-4 border-t border-dashed border-[#DADDE6]" />

            <div className="ml-auto w-64 space-y-1 text-sm">
              <div className="flex justify-between text-[#4A5060]">
                <span>Subtotal</span>
                <span>{cedi(sale.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#4A5060]">
                <span>Discount</span>
                <span>-{cedi(sale.discount_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-[#DADDE6] pt-2 text-lg font-bold text-[#0B0E1A]">
                <span>Total</span>
                <span>{cedi(sale.total)}</span>
              </div>
              <div className="flex justify-between pt-1 text-xs text-[#4A5060]">
                <span>Payment method</span>
                <span>{sale.payment_method.replace(/_/g, " ")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sale info sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Sale Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Receipt No.</dt>
                <dd className="font-mono font-medium text-[#0B0E1A]">{sale.receipt_number}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Date & Time</dt>
                <dd className="text-[#0B0E1A]">{fmt12(sale.sold_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Branch</dt>
                <dd className="text-[#0B0E1A]">{sale.branch_name ?? "N/A"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Cashier</dt>
                <dd className="text-[#0B0E1A]">{sale.cashier_name ?? "N/A"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Customer</dt>
                <dd className="text-[#0B0E1A]">{sale.customer_name ?? "Walk-in"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Payment</dt>
                <dd className="text-[#0B0E1A]">{sale.payment_method.replace(/_/g, " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Status</dt>
                <dd className="text-[#0B0E1A]">{sale.status.replace(/_/g, " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Offline sale</dt>
                <dd className="text-[#0B0E1A]">{sale.is_offline ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Items</dt>
                <dd className="text-[#0B0E1A]">{sale.items.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Total units</dt>
                <dd className="text-[#0B0E1A]">
                  {sale.items.reduce((s, i) => s + parseFloat(i.quantity), 0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Subtotal</dt>
                <dd className="text-[#0B0E1A]">{cedi(sale.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Discount</dt>
                <dd className="text-[#0B0E1A]">{cedi(sale.discount_amount)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#DADDE6] pt-2 font-bold">
                <dt className="text-[#0B0E1A]">Total</dt>
                <dd className="text-[#0B0E1A]">{cedi(sale.total)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {showVoidConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-[#C62828]">Void this sale?</h2>
            <p className="mb-5 text-sm text-[#4A5060]">
              Voiding will mark sale {sale.receipt_number} as VOIDED and restock all items.
              This action cannot be undone.
            </p>
            {error && (
              <div className="mb-3 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={voidSale}
                disabled={voiding}
                className="flex-1 rounded-full bg-[#C62828] py-2 text-sm font-semibold text-white hover:bg-[#A32020] disabled:opacity-50"
              >
                {voiding ? "Voiding..." : "Yes, void sale"}
              </button>
              <button
                onClick={() => { setShowVoidConfirm(false); setError(null); }}
                className="flex-1 rounded border border-[#DADDE6] py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
