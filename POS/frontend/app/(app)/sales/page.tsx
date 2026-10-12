"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonCards, SkeletonTable } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { PageHeader, cedi } from "@/components/ui";

export default function SalesPage() {
  return <SalesHistory />;
}

interface BranchSummary {
  branch_id: number;
  branch_name: string;
  total_sales: number;
  total_revenue: string;
  total_discount: string;
  cashiers: {
    cashier_id: number;
    cashier_name: string;
    role_name: string;
    sales_count: number;
    revenue: string;
  }[];
}

interface DailySummary {
  date: string;
  total_sales: number;
  total_revenue: string;
  total_discount: string;
  branches: BranchSummary[];
}

function SalesHistory() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await api<DailySummary>("/api/v1/reports/daily-summary", { params: { date } });
      setSummary(res);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(selectedDate); }, [selectedDate, load]);

  const formattedDate = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="p-4 sm:p-6">
      {/* Header with custom date picker */}
      <PageHeader
        title="Sales History"
        breadcrumb="Sales History"
        subtitle={formattedDate}
        actions={
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 rounded-xl border border-[#DADDE6] bg-white px-4 py-2 text-sm font-medium text-[#0B0E1A] shadow-sm hover:bg-[#FAFAFC]"
            >
              <svg className="h-4 w-4 text-[#4A5060]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formattedDate}
            </button>
            {showDatePicker && (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-[#DADDE6] bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => {
                      const d = new Date(selectedDate + "T00:00:00");
                      d.setDate(d.getDate() - 1);
                      setSelectedDate(d.toISOString().slice(0, 10));
                    }}
                    className="rounded p-1 hover:bg-[#EDEFF9]"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-sm font-medium text-[#0B0E1A]">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </span>
                  <button
                    onClick={() => {
                      const d = new Date(selectedDate + "T00:00:00");
                      d.setDate(d.getDate() + 1);
                      setSelectedDate(d.toISOString().slice(0, 10));
                    }}
                    className="rounded p-1 hover:bg-[#EDEFF9]"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setShowDatePicker(false); }}
                  className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      const d = new Date();
                      setSelectedDate(d.toISOString().slice(0, 10));
                      setShowDatePicker(false);
                    }}
                    className="flex-1 rounded-full bg-[#061161] py-1.5 text-xs font-semibold text-white hover:bg-[#0A1C8C]"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="flex-1 rounded border border-[#DADDE6] py-1.5 text-xs font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* Overall summary cards */}
      {loading ? (
        <SkeletonCards count={3} />
      ) : summary ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
            <div className="text-xs font-semibold uppercase text-[#4A5060]">Total Sales</div>
            <div className="mt-1 text-2xl font-bold text-[#0B0E1A]">{summary.total_sales}</div>
          </div>
          <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
            <div className="text-xs font-semibold uppercase text-[#4A5060]">Total Revenue</div>
            <div className="mt-1 text-2xl font-bold text-[#0B0E1A]">{cedi(summary.total_revenue)}</div>
          </div>
          <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
            <div className="text-xs font-semibold uppercase text-[#4A5060]">Total Discounts</div>
            <div className="mt-1 text-2xl font-bold text-[#0B0E1A]">{cedi(summary.total_discount)}</div>
          </div>
        </div>
      ) : null}

      {/* Branch breakdown */}
      <h2 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Branch Performance</h2>
      {loading ? (
        <SkeletonTable rows={3} cols={4} />
      ) : summary && summary.branches.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {summary.branches.map((b) => (
            <div key={b.branch_id} className="rounded-xl border border-[#DADDE6] bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-[#0B0E1A]">{b.branch_name}</h3>
                <Link
                  href={`/sales/branch/${b.branch_id}?date=${selectedDate}`}
                  className="rounded-full bg-[#061161] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0A1C8C]"
                >
                  View Details
                </Link>
              </div>
              <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-[#4A5060]">Sales</div>
                  <div className="font-semibold text-[#0B0E1A]">{b.total_sales}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Revenue</div>
                  <div className="font-semibold text-[#0B0E1A]">{cedi(b.total_revenue)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Discounts</div>
                  <div className="font-semibold text-[#0B0E1A]">{cedi(b.total_discount)}</div>
                </div>
              </div>
              <div className="border-t border-[#DADDE6] pt-3">
                <div className="mb-2 text-xs font-semibold uppercase text-[#4A5060]">Cashiers</div>
                <div className="space-y-2">
                  {b.cashiers.map((c) => (
                    <div key={c.cashier_id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-[#0B0E1A]">{c.cashier_name}</span>
                        <span className="ml-2 rounded-full bg-[#EDEFF9] px-1.5 py-0.5 text-xs text-[#4A5060]">{c.role_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#4A5060]">{c.sales_count} sales</span>
                        <span className="ml-2 font-medium text-[#0B0E1A]">{cedi(c.revenue)}</span>
                      </div>
                    </div>
                  ))}
                  {b.cashiers.length === 0 && (
                    <div className="text-sm text-[#6B7183]">No sales recorded</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">
          No sales recorded on this date
        </div>
      )}
    </div>
  );
}
