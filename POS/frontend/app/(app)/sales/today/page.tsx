"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, getStoredUser } from "@/lib/api";
import type { Branch, Paginated, Sale } from "@/lib/types";
import { cedi, Pagination } from "@/components/ui";

export default function TodaySalesPage() {
  const user = getStoredUser();
  const userBranchId = user?.branch_id ?? null;
  const canViewAll = user?.permissions.includes("reports.view_all_branches") ?? false;

  const [branches, setBranches] = useState<Branch[]>([]);
  // Filters are read from the URL so the sale-detail page can send the user
  // back to this exact view via its returnTo parameter.
  const [branchId, setBranchId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const b = new URLSearchParams(window.location.search).get("branch");
      if (b) return Number(b);
    }
    return userBranchId;
  });
  const [data, setData] = useState<Paginated<Sale> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const p = Number(new URLSearchParams(window.location.search).get("page"));
      return Number.isInteger(p) && p > 0 ? p : 1;
    }
    return 1;
  });
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("search") ?? "";
    }
    return "";
  });
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleLoading, setSaleLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window !== "undefined") {
      const d = new URLSearchParams(window.location.search).get("date");
      if (d) return d;
    }
    return today;
  });

  // URL describing the current filtered list, sent as returnTo so the
  // detail page's back button restores this view.
  const listUrl = `/sales/today?${new URLSearchParams({
    ...(branchId !== null ? { branch: String(branchId) } : {}),
    date: selectedDate,
    ...(search ? { search } : {}),
    page: String(page),
  }).toString()}`;

  const load = useCallback(async (b: number | null, p: number, date: string, q: string) => {
    setLoading(p === 1);
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        date_from: date,
        date_to: date,
        page: p,
        page_size: 15,
      };
      if (b !== null) params.branch_id = b;
      if (q.trim()) params.search = q.trim();
      const res = await api<Paginated<Sale>>("/api/v1/sales", { params });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canViewAll) {
      api<Branch[]>("/api/v1/branches").then(setBranches).catch(() => {});
    }
  }, [canViewAll]);

  useEffect(() => {
    load(branchId, page, selectedDate, search);
  }, [branchId, page, selectedDate, search, load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  // 12-hour date format helper
  const fmt12 = (iso: string) => {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  async function viewSaleDetails(saleId: number) {
    setSaleLoading(true);
    try {
      const s = await api<Sale>(`/api/v1/sales/by-id/${saleId}`);
      setSelectedSale(s);
    } catch {
      /* ignore */
    } finally {
      setSaleLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Breadcrumbs */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href="/pos" className="font-medium text-[#061161] hover:underline">POS</Link>
        <span className="text-[#6B7183]">/</span>
        <span className="font-medium text-[#0B0E1A]">Today's Sales</span>
      </div>

      {/* Header with filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-[#0B0E1A]">Today's Sales</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canViewAll && (
            <select
              value={branchId ?? ""}
              onChange={(e) => { setBranchId(e.target.value ? Number(e.target.value) : null); setPage(1); }}
              className="rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
            className="rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search receipt no..."
            className="w-48 rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Summary */}
      {!loading && data && data.items.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#DADDE6] bg-white p-4">
            <div className="text-xs font-semibold uppercase text-[#4A5060]">Total Sales</div>
            <div className="mt-1 text-2xl font-bold text-[#0B0E1A]">{data.total}</div>
          </div>
          <div className="rounded-xl border border-[#DADDE6] bg-white p-4">
            <div className="text-xs font-semibold uppercase text-[#4A5060]">Total Revenue</div>
            <div className="mt-1 text-2xl font-bold text-[#0B0E1A]">
              {cedi(data.items.reduce((s, x) => s + parseFloat(x.total), 0))}
            </div>
          </div>
          <div className="rounded-xl border border-[#DADDE6] bg-white p-4">
            <div className="text-xs font-semibold uppercase text-[#4A5060]">Date</div>
            <div className="mt-1 text-lg font-bold text-[#0B0E1A]">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
        </div>
      )}

      {/* Sales list */}
      {loading ? (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">Loading sales...</div>
      ) : data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#DADDE6] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
              <tr>
                <th className="px-4 py-2">Receipt</th>
                <th className="px-4 py-2">Time</th>
                {branchId === null && canViewAll && <th className="px-4 py-2">Branch</th>}
                <th className="px-4 py-2">Cashier</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Payment</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
                  <td className="px-4 py-2 font-medium text-[#061161]">{s.receipt_number}</td>
                  <td className="px-4 py-2 text-[#4A5060]">
                    {new Date(s.sold_at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </td>
                  {branchId === null && canViewAll && (
                    <td className="px-4 py-2 text-[#4A5060]">{s.branch_name ?? "-"}</td>
                  )}
                  <td className="px-4 py-2 text-[#4A5060]">{s.cashier_name ?? "N/A"}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{s.customer_name ?? "Walk-in"}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{s.payment_method.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-right font-semibold">{cedi(s.total)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === "COMPLETED" ? "bg-[#16803C]/15 text-[#16803C]" :
                      s.status === "VOIDED" ? "bg-[#C62828]/15 text-[#C62828]" :
                      "bg-[#EDEFF9] text-[#4A5060]"
                    }`}>
                      {s.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => viewSaleDetails(s.id)}
                      disabled={saleLoading}
                      className="rounded border border-[#DADDE6] px-3 py-1 text-xs font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">
          No sales recorded on this date
        </div>
      )}

      {/* Pagination */}
      {data && pages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination
            className="mt-0"
            page={page}
            pages={pages}
            onPage={(p) => { setPage(p); load(branchId, p, selectedDate, search); }}
          />
        </div>
      )}

      {/* Sale details modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-2xl">
            {/* Modal header with breadcrumbs */}
            <div className="sticky top-0 border-b border-[#DADDE6] bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Link href="/sales/today" onClick={() => setSelectedSale(null)} className="font-medium text-[#061161] hover:underline">
                    Today's Sales
                  </Link>
                  <span className="text-[#6B7183]">/</span>
                  <span className="font-medium text-[#0B0E1A]">{selectedSale.receipt_number}</span>
                </div>
                <button onClick={() => setSelectedSale(null)} className="text-[#6B7183] hover:text-[#4A5060]">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Sale details */}
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0B0E1A]">{selectedSale.receipt_number}</h2>
                  <p className="text-sm text-[#4A5060]">{fmt12(selectedSale.sold_at)}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                  selectedSale.status === "COMPLETED" ? "bg-[#16803C]/15 text-[#16803C]" :
                  selectedSale.status === "VOIDED" ? "bg-[#C62828]/15 text-[#C62828]" :
                  "bg-[#EDEFF9] text-[#4A5060]"
                }`}>
                  {selectedSale.status.replace(/_/g, " ")}
                </span>
              </div>

              {/* Info grid */}
              <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl bg-[#FAFAFC] p-4 text-sm">
                <div>
                  <div className="text-xs text-[#4A5060]">Cashier</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedSale.cashier_name ?? "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Customer</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedSale.customer_name ?? "Walk-in"}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Payment Method</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedSale.payment_method.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Branch</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedSale.branch_name ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Items</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedSale.items.length}</div>
                </div>
              </div>

              {/* Items table */}
              <div className="overflow-hidden rounded-xl border border-[#DADDE6]">
                <table className="w-full text-sm">
                  <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                    <tr>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Unit Price</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.items.map((i) => (
                      <tr key={i.id} className="border-t border-[#DADDE6]">
                        <td className="px-4 py-2">
                          <div className="font-medium text-[#0B0E1A]">{i.product_name}</div>
                          <div className="text-xs text-[#4A5060]">{i.variant_name}</div>
                        </td>
                        <td className="px-4 py-2 text-right">{parseFloat(i.quantity)}</td>
                        <td className="px-4 py-2 text-right">{cedi(i.unit_price)}</td>
                        <td className="px-4 py-2 text-right font-medium">{cedi(i.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
                <div className="flex justify-between text-[#4A5060]">
                  <span>Subtotal</span>
                  <span>{cedi(selectedSale.subtotal)}</span>
                </div>
                {parseFloat(selectedSale.discount_amount) > 0 && (
                  <div className="flex justify-between text-[#4A5060]">
                    <span>Discount</span>
                    <span>-{cedi(selectedSale.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#DADDE6] pt-2 text-lg font-bold text-[#0B0E1A]">
                  <span>Total</span>
                  <span>{cedi(selectedSale.total)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                <Link
                  href={`/sales/${selectedSale.id}?returnTo=${encodeURIComponent(listUrl)}`}
                  className="flex-1 rounded-xl border border-[#DADDE6] py-2.5 text-center text-sm font-semibold text-[#0B0E1A] hover:bg-[#FAFAFC]"
                >
                  Full Details
                </Link>
                <button
                  onClick={() => setSelectedSale(null)}
                  className="flex-1 rounded-xl bg-[#061161] py-2.5 text-sm font-semibold text-white hover:bg-[#0A1C8C]"
                >
                  Back to List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
