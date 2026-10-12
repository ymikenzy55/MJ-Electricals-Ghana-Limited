"use client";

import { Fragment, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonTable } from "@/components/Skeleton";
import { api, apiDownload, getStoredUser } from "@/lib/api";
import type { Branch, Paginated, Sale } from "@/lib/types";
import { cedi, Pagination } from "@/components/ui";

export default function BranchSalesPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = use(params);
  return <BranchSales branchId={Number(branchId)} />;
}

function BranchSales({ branchId }: { branchId: number }) {
  const user = getStoredUser();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchName, setBranchName] = useState("");
  const [data, setData] = useState<Paginated<Sale> | null>(null);
  const [loading, setLoading] = useState(true);
  // Restore the page from the URL so returning from a sale detail lands on
  // the same filtered page the user left.
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const p = Number(new URLSearchParams(window.location.search).get("page"));
      return Number.isInteger(p) && p > 0 ? p : 1;
    }
    return 1;
  });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  // Get date from URL query
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("date") || new Date().toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  });

  // Full URL of this filtered list, embedded in sale links so the detail
  // page can navigate back to exactly this view.
  const listUrl = `/sales/branch/${branchId}?date=${selectedDate}&page=${page}`;

  const load = useCallback(async (b: number, p: number, date: string) => {
    setLoading(p === 1);
    try {
      const res = await api<Paginated<Sale>>("/api/v1/sales", {
        params: {
          branch_id: b,
          date_from: date,
          date_to: date,
          page: p,
          page_size: 25,
        },
      });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<Branch[]>("/api/v1/branches").then((bs) => {
      setBranches(bs);
      const b = bs.find((x) => x.id === branchId);
      setBranchName(b?.name ?? "Unknown Branch");
    }).catch(() => {});
    load(branchId, page, selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page is managed via the pagination buttons
  }, [branchId, selectedDate, load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  async function exportExcel() {
    setExporting(true);
    try {
      const blob = await apiDownload("/api/v1/sales/export/excel", {
        branch_id: branchId,
        date_from: selectedDate,
        date_to: selectedDate,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales_branch_${branchId}_${selectedDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/sales" className="font-medium text-[#061161] hover:underline">Sales History</Link>
            <span className="text-[#6B7183]">/</span>
            <span className="font-medium text-[#0B0E1A]">{branchName}</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={exportExcel}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? "Exporting..." : "Export to Excel"}
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="mb-3 text-sm text-[#4A5060]">
            {data.total} sale(s) on {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div className="overflow-x-auto rounded border border-[#DADDE6] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                <tr>
                  <th className="px-3 py-2">Receipt</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Cashier</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <FragmentRow key={s.id} sale={s} expanded={expanded === s.id} listUrl={listUrl} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} />
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex justify-center">
              <Pagination
                page={page}
                pages={pages}
                onPage={(p) => { setPage(p); load(branchId, p, selectedDate); }}
              />
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">
          No sales recorded on this date
        </div>
      )}
    </div>
  );
}

function FragmentRow({ sale, expanded, listUrl, onToggle }: { sale: Sale; expanded: boolean; listUrl: string; onToggle: () => void }) {
  return (
    <Fragment>
      <tr onClick={onToggle} className="cursor-pointer border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
        <td className="px-3 py-2 font-medium text-[#061161]">
          <Link href={`/sales/${sale.id}?returnTo=${encodeURIComponent(listUrl)}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
            {sale.receipt_number}
          </Link>
        </td>
        <td className="px-3 py-2 text-[#4A5060]">{new Date(sale.sold_at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</td>
        <td className="px-3 py-2 text-[#4A5060]">{sale.cashier_name ?? "N/A"}</td>
        <td className="px-3 py-2 text-[#4A5060]">{sale.customer_name ?? "Walk-in"}</td>
        <td className="px-3 py-2 text-[#4A5060]">{sale.payment_method.replace(/_/g, " ")}</td>
        <td className="px-3 py-2 text-right text-[#4A5060]">{cedi(sale.discount_amount)}</td>
        <td className="px-3 py-2 text-right font-semibold">{cedi(sale.total)}</td>
      </tr>
      {expanded && (
        <tr className="border-t border-[#DADDE6] bg-[#FAFAFC]">
          <td colSpan={7} className="px-6 py-3">
            <table className="w-full text-xs">
              <thead className="text-left text-[#4A5060]">
                <tr>
                  <th className="py-1">Product</th>
                  <th className="py-1">Variant</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">Unit Price</th>
                  <th className="py-1 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-1">{i.product_name}</td>
                    <td className="py-1 text-[#4A5060]">{i.variant_name}</td>
                    <td className="py-1 text-right">{parseFloat(i.quantity)}</td>
                    <td className="py-1 text-right">{cedi(i.unit_price)}</td>
                    <td className="py-1 text-right">{cedi(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
