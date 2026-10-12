"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiDownload, getStoredUser } from "@/lib/api";
import type { Branch } from "@/lib/types";
import { PageHeader, Pagination, cedi } from "@/components/ui";

export default function ReportsPage() {
  return (
    <ReportsScreen />
  );
}

interface SalesReport {
  total_sales: number;
  total_revenue: string;
  total_discount: string;
  by_branch: { branch_id: number; branch_name: string; sales: number; revenue: string }[];
  by_cashier: { cashier_id: number; cashier_name: string; sales: number; revenue: string }[];
  by_product: { product_id: number; product_name: string; quantity: string; revenue: string }[];
  by_category: { category_id: number; category_name: string; quantity: string; revenue: string }[];
}

/** One flat row per sold line item, mirrors the CSV export exactly. */
interface DetailRow {
  sale_id: number;
  receipt_number: string;
  sold_at: string;
  branch_name: string | null;
  cashier_name: string | null;
  customer_name: string | null;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: string;
  unit_price: string;
  line_discount: string;
  line_total: string;
  sale_subtotal: string;
  sale_discount: string;
  tax_amount: string;
  sale_total: string;
  payment_method: string;
  status: string;
}

interface DetailResponse {
  items: DetailRow[];
  total: number;
  page: number;
  page_size: number;
}

const fmt12 = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

function ReportsScreen() {
  const user = getStoredUser();
  const isAdmin = user?.branch_id == null;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<SalesReport | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      api<Branch[]>("/api/v1/branches").then(setBranches).catch(() => {});
    }
  }, [isAdmin]);

  const filters = useCallback(
    () => ({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      branch_id: isAdmin ? (branchId ?? undefined) : undefined,
      search: search.trim() || undefined,
    }),
    [dateFrom, dateTo, branchId, search, isAdmin],
  );

  const runReport = useCallback(async (p: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [summary, rows] = await Promise.all([
        api<SalesReport>("/api/v1/reports/sales", { params: filters() }),
        api<DetailResponse>("/api/v1/reports/sales/detail", {
          params: { ...filters(), page: p, page_size: 50 },
        }),
      ]);
      setData(summary);
      setDetail(rows);
      setPage(p);
    } catch (e: any) {
      setError(e.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await apiDownload("/api/v1/reports/sales/export.csv", filters());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales_report_${dateFrom || "all"}_${dateTo || "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const pages = detail ? Math.max(1, Math.ceil(detail.total / detail.page_size)) : 1;
  const branchName =
    branchId === null
      ? "All Branches"
      : branches.find((b) => b.id === branchId)?.name ?? `Branch ${branchId}`;

  return (
    <div className="p-6">
      <PageHeader
        title="Sales Reports"
        breadcrumb="Sales Reports"
        actions={
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">From date</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded border border-[#DADDE6] px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">To date</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded border border-[#DADDE6] px-3 py-2 text-sm" />
        </label>
        {isAdmin && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Branch</span>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
              className="rounded border border-[#DADDE6] px-3 py-2 text-sm"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Receipt no.</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt..."
            className="w-40 rounded border border-[#DADDE6] px-3 py-2 text-sm"
          />
        </label>
        <button onClick={() => runReport(1)} disabled={loading} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">
          {loading ? "Running..." : "Run Report"}
        </button>
      </div>

      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[#C7CCE9] bg-[#EDEFF9] p-4">
              <div className="text-xs font-medium uppercase text-[#061161]">Total Sales</div>
              <div className="text-2xl font-bold text-[#061161]">{data.total_sales}</div>
            </div>
            <div className="rounded-xl border border-[#16803C]/30 bg-[#16803C]/10 p-4">
              <div className="text-xs font-medium uppercase text-[#16803C]">Total Revenue</div>
              <div className="text-2xl font-bold text-[#106B32]">{cedi(data.total_revenue)}</div>
            </div>
            <div className="rounded-xl border border-[#B7791F]/30 bg-[#B7791F]/10 p-4">
              <div className="text-xs font-medium uppercase text-[#B7791F]">Total Discounts</div>
              <div className="text-2xl font-bold text-[#8F5E18]">{cedi(data.total_discount)}</div>
            </div>
          </div>

          {/* Per-sale detail table, one row per line item, same layout as the CSV */}
          <div className="mb-6 rounded-xl border border-[#DADDE6] bg-white">
            <div className="flex items-center justify-between border-b border-[#DADDE6] px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase text-[#4A5060]">Sales Detail</h2>
                <p className="text-xs text-[#6B7183]">
                  {detail?.total ?? 0} line items · {branchName}
                  {dateFrom || dateTo ? ` · ${dateFrom || "start"} to ${dateTo || "today"}` : " · all dates"}
                </p>
              </div>
            </div>
            {!detail || detail.items.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#6B7183]">No sales found for this filter</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                    <tr>
                      <th className="px-3 py-2">Receipt</th>
                      <th className="px-3 py-2">Date &amp; Time</th>
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Cashier</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Line Disc.</th>
                      <th className="px-3 py-2 text-right">Line Total</th>
                      <th className="px-3 py-2 text-right">Sale Total</th>
                      <th className="px-3 py-2">Payment</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((r, i) => (
                      <tr key={`${r.sale_id}-${i}`} className="border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
                        <td className="px-3 py-2 font-medium text-[#061161]">{r.receipt_number}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[#4A5060]">{fmt12(r.sold_at)}</td>
                        <td className="px-3 py-2 text-[#4A5060]">{r.branch_name ?? "-"}</td>
                        <td className="px-3 py-2 text-[#4A5060]">{r.cashier_name ?? "-"}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-[#0B0E1A]">{r.product_name}</div>
                          <div className="text-xs text-[#4A5060]">{r.variant_name}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#4A5060]">{r.sku}</td>
                        <td className="px-3 py-2 text-right text-[#0B0E1A]">{parseFloat(r.quantity)}</td>
                        <td className="px-3 py-2 text-right text-[#0B0E1A]">{cedi(r.unit_price)}</td>
                        <td className="px-3 py-2 text-right text-[#0B0E1A]">{cedi(r.line_discount)}</td>
                        <td className="px-3 py-2 text-right font-medium text-[#0B0E1A]">{cedi(r.line_total)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[#0B0E1A]">{cedi(r.sale_total)}</td>
                        <td className="px-3 py-2 text-[#4A5060]">{r.payment_method.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.status === "COMPLETED" ? "bg-[#16803C]/15 text-[#16803C]" :
                            r.status === "VOIDED" ? "bg-[#C62828]/15 text-[#C62828]" :
                            "bg-[#B7791F]/15 text-[#B7791F]"
                          }`}>
                            {r.status.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {detail && pages > 1 && (
              <div className="flex justify-center border-t border-[#DADDE6] py-3">
                <Pagination className="mt-0" page={page} pages={pages} onPage={(p) => runReport(p)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ReportTable title="By Branch" rows={data.by_branch.map((b) => ({ label: b.branch_name, cols: [String(b.sales), cedi(b.revenue)] }))} headers={["Branch", "Sales", "Revenue"]} />
            <ReportTable title="By Cashier" rows={data.by_cashier.map((c) => ({ label: c.cashier_name, cols: [String(c.sales), cedi(c.revenue)] }))} headers={["Cashier", "Sales", "Revenue"]} />
            <ReportTable title="By Product" rows={data.by_product.map((p) => ({ label: p.product_name, cols: [p.quantity, cedi(p.revenue)] }))} headers={["Product", "Qty", "Revenue"]} />
            <ReportTable title="By Category" rows={data.by_category.map((c) => ({ label: c.category_name, cols: [c.quantity, cedi(c.revenue)] }))} headers={["Category", "Qty", "Revenue"]} />
          </div>
        </>
      )}
    </div>
  );
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: { label: string; cols: string[] }[] }) {
  return (
    <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[#6B7183]">No data</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[#6B7183]">
            <tr>
              {headers.map((h) => (
                <th key={h} className="py-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[#DADDE6]">
                <td className="py-1.5 font-medium text-[#0B0E1A]">{r.label}</td>
                {r.cols.map((c, j) => <td key={j} className="py-1.5 text-right text-[#4A5060]">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
