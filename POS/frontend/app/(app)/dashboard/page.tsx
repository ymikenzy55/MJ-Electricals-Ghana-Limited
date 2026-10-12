"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AreaChart, DonutChart, HBarChart } from "@/components/Charts";
import { api, ApiError, getStoredUser } from "@/lib/api";
import { PageHeader, StatCard, SectionCard, EmptyState, cedi } from "@/components/ui";
import type {
  Branch,
  LowStockItem,
  PaymentMixItem,
  TopProduct,
  TrendPoint,
} from "@/lib/types";

interface DashData {
  today_sales_count: number;
  today_revenue: string;
  today_returns_count: number;
  low_stock_count: number;
  total_products: number;
  total_customers: number;
  held_sales_count: number;
  recent_sales: {
    receipt_number: string;
    total: string;
    sold_at: string;
    cashier_name: string | null;
  }[];
}

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default function DashboardPage() {
  return <Dashboard />;
}

function Dashboard() {
  const user = getStoredUser();
  const isAdmin = user?.branch_id === null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(user?.branch_id ?? null);
  const [days, setDays] = useState(30);

  const [data, setData] = useState<DashData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [mix, setMix] = useState<PaymentMixItem[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Session cache key for the last dashboard payload. Allows instant render
  // on re-visits while the fresh network request fills in the background.
  const DASH_CACHE = "mj_dash_cache";

  useEffect(() => {
    if (!isAdmin) return;
    api<Branch[]>("/api/v1/branches")
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [isAdmin]);

  const load = useCallback(
    async (bid: number | null, d: number) => {
      // Try to restore the last payload from sessionStorage so the page
      // renders instantly while the fresh data is still loading.
      const cacheKey = `${DASH_CACHE}_${bid ?? "all"}_${d}`;
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached.data) setData(cached.data);
          if (cached.trend) setTrend(cached.trend);
          if (cached.top) setTop(cached.top);
          if (cached.mix) setMix(cached.mix);
          if (cached.lowStock) setLowStock(cached.lowStock);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } catch {
        /* ignore cache read errors */
      }
      setError(null);
      const p: Record<string, string | number | undefined> = {
        branch_id: bid ?? undefined,
      };
      const [dash, tr, tp, pm, ls] = await Promise.allSettled([
        api<DashData>("/api/v1/reports/dashboard", { params: p }),
        api<{ points: TrendPoint[] }>("/api/v1/reports/sales-trend", {
          params: { ...p, days: d },
        }),
        api<{ items: TopProduct[] }>("/api/v1/reports/top-products", {
          params: { ...p, days: d, limit: 8 },
        }),
        api<{ items: PaymentMixItem[] }>("/api/v1/reports/payment-mix", {
          params: { ...p, days: d },
        }),
        api<{ items: LowStockItem[] }>("/api/v1/reports/low-stock", {
          params: { ...p, limit: 8 },
        }),
      ]);

      if (dash.status === "fulfilled") setData(dash.value);
      else
        setError(
          dash.reason instanceof ApiError ? dash.reason.message : "Failed to load dashboard",
        );
      setTrend(tr.status === "fulfilled" ? tr.value.points : []);
      setTop(tp.status === "fulfilled" ? tp.value.items : []);
      setMix(pm.status === "fulfilled" ? pm.value.items : []);
      setLowStock(ls.status === "fulfilled" ? ls.value.items : []);
      setLoading(false);

      // Persist the fresh payload for next visit.
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            data: dash.status === "fulfilled" ? dash.value : null,
            trend: tr.status === "fulfilled" ? tr.value.points : [],
            top: tp.status === "fulfilled" ? tp.value.items : [],
            mix: pm.status === "fulfilled" ? pm.value.items : [],
            lowStock: ls.status === "fulfilled" ? ls.value.items : [],
          }),
        );
      } catch {
        /* ignore quota errors */
      }
    },
    [],
  );

  useEffect(() => {
    load(branchId, days);
  }, [branchId, days, load]);

  const trendPoints = useMemo(
    () =>
      trend.map((p) => ({
        label: new Date(p.date + "T00:00:00").toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        }),
        value: parseFloat(p.revenue) || 0,
      })),
    [trend],
  );

  const periodRevenue = useMemo(
    () => trend.reduce((s, p) => s + (parseFloat(p.revenue) || 0), 0),
    [trend],
  );
  const periodSales = useMemo(() => trend.reduce((s, p) => s + p.sales, 0), [trend]);
  const periodTax = useMemo(
    () => trend.reduce((s, p) => s + (parseFloat(p.tax) || 0), 0),
    [trend],
  );

  // Permission-gated quick-link tiles, clean, consistent design system.
  const tiles = [
    { href: "/pos", label: "POS Checkout", value: "Open", icon: IconGrid, perm: "sales.create" },
    { href: "/products", label: "Products", value: data ? String(data.total_products) : "-", icon: IconBarcode, perm: "products.view" },
    { href: "/sales", label: "Sales Today", value: data ? String(data.today_sales_count) : "-", icon: IconCartTile, perm: "sales.view" },
    { href: "/inventory?low_stock=1", label: "Low Stock", value: data ? String(data.low_stock_count) : "-", icon: IconBell, perm: "inventory.view" },
    { href: "/inventory", label: "Stock Levels", value: "View", icon: IconFolder, perm: "inventory.view" },
    { href: "/returns", label: "Returns Today", value: data ? String(data.today_returns_count) : "-", icon: IconCard, perm: "sales.return" },
    { href: "/customers", label: "Customers", value: data ? String(data.total_customers) : "-", icon: IconUsers, perm: "customers.view" },
    { href: "/shifts", label: "Cash Drawer", value: "Shifts", icon: IconCog2, perm: "shifts.operate" },
    { href: "/reports", label: "Reports", value: "View", icon: IconChartTile, perm: "reports.view" },
    { href: "/users", label: "Users", value: "Manage", icon: IconUsers, perm: "users.manage" },
    { href: "/transfers", label: "Transfers", value: "Branch", icon: IconTruckTile, perm: "inventory.view" },
    { href: "/branches", label: "Branches", value: "Manage", icon: IconHome, perm: "branches.manage" },
  ].filter((t) => {
    const perms = user?.permissions ?? [];
    return !t.perm || perms.includes(t.perm);
  });

  return (
    <div className="min-h-full">
      <PageHeader
        title="Dashboard"
        breadcrumb="Dashboard"
        subtitle={user?.branch_name ?? (isAdmin ? "All branches" : "")}
        actions={
          <>
            {isAdmin && branches.length > 0 && (
              <select
                value={branchId ?? ""}
                onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-xl border border-[#DADDE6] bg-white px-3 py-1.5 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none"
                aria-label="Filter by branch"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-0.5 rounded-full border border-[#DADDE6] bg-white p-1">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={`px-3.5 py-1.5 text-[13px] font-medium transition ${
                    days === r.days
                      ? "bg-[#061161] text-white"
                      : "text-[#4A5060] hover:bg-[#FAFAFC]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="p-6">
        {error && (
          <div className="mb-5 rounded-xl border border-[#C62828]/30 bg-[#C62828]/10 px-4 py-2.5 text-sm text-[#C62828]">
            {error}
          </div>
        )}

        {/* Quick links, clean white cards with blue accent */}
        <section className="mb-6">
          <h2 className="mb-3 text-base font-semibold text-[#0B0E1A]">Quick Access</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-[#DADDE6] bg-white px-4 py-3 transition hover:border-[#061161] hover:bg-[#FAFAFC] focus:outline-none focus:ring-2 focus:ring-[#061161]/30"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#EDEFF9] text-[#061161] transition group-hover:bg-[#061161] group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-semibold leading-tight tabular-nums text-[#0B0E1A]">
                      {loading ? "\u2026" : t.value}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#4A5060]">
                      {t.label}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Summary tiles */}
        <section className="mb-6">
          <h2 className="mb-3 text-base font-semibold text-[#0B0E1A]">Quick Overview</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Revenue Today" value={data ? cedi(data.today_revenue) : "-"} loading={loading} icon={<IconMoney />} />
            <StatCard label={`Revenue (${days}d)`} value={cedi(periodRevenue)} loading={loading} icon={<IconChartTile />} />
            <StatCard label={`Sales (${days}d)`} value={String(periodSales)} loading={loading} icon={<IconCartTile />} />
            <StatCard label={`Tax (${days}d)`} value={cedi(periodTax)} loading={loading} icon={<IconCard />} />
          </div>
        </section>

        {/* Sales analytics */}
        <section className="mb-6">
          <h2 className="mb-3 text-base font-semibold text-[#0B0E1A]">Sales Analytics</h2>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SectionCard
              title="Sales Trend"
              className="xl:col-span-2"
              bodyClassName="p-4"
              action={
                <span className="text-right">
                  <span className="block text-base font-bold tabular-nums text-[#0B0E1A]">{cedi(periodRevenue)}</span>
                  <span className="block text-xs text-[#6B7183]">{periodSales} sales · last {days} days</span>
                </span>
              }
            >
              {loading ? (
                <div className="h-60 animate-pulse rounded-full bg-[#EDEFF9]" />
              ) : (
                <AreaChart points={trendPoints} height={250} />
              )}
            </SectionCard>

            <SectionCard title="Payment Mix" bodyClassName="p-5">
              {loading ? (
                <div className="h-40 animate-pulse rounded-full bg-[#EDEFF9]" />
              ) : (
                <DonutChart
                  items={mix.map((m) => ({
                    label: m.method.replace(/_/g, " "),
                    value: parseFloat(m.amount) || 0,
                  }))}
                />
              )}
            </SectionCard>
          </div>
        </section>

        {/* Top products + low stock */}
        <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard title="Top Products" action={<span className="text-xs text-[#4A5060]">Last {days} days</span>} bodyClassName="p-5">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-full bg-[#EDEFF9]" />
                ))}
              </div>
            ) : (
              <HBarChart
                items={top.map((t) => ({
                  label: t.product_name,
                  value: parseFloat(t.revenue) || 0,
                  sub: `${parseFloat(t.quantity)} sold`,
                }))}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Low Stock Alerts"
            action={<Link href="/inventory?low_stock=1" className="text-xs font-medium text-[#061161] hover:underline">View all</Link>}
            bodyClassName="p-5"
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-full bg-[#EDEFF9]" />
                ))}
              </div>
            ) : lowStock.length === 0 ? (
              <EmptyState message="All items are above their reorder level" />
            ) : (
              <ul className="divide-y divide-[#DADDE6]">
                {lowStock.map((it) => {
                  const qty = parseFloat(it.quantity);
                  return (
                    <li
                      key={it.variant_id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[#0B0E1A]">
                          {it.product_name}
                        </div>
                        <div className="truncate text-xs text-[#4A5060]">
                          {it.variant_name} {"\u00b7"} {it.sku}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                          qty <= 0
                            ? "bg-[#C62828]/15 text-[#C62828]"
                            : "bg-[#B7791F]/15 text-[#B7791F]"
                        }`}
                      >
                        {qty <= 0 ? "Out of stock" : `${qty} ${it.unit} left`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </section>

        {/* Recent sales */}
        <SectionCard
          title="Recent Sales"
          action={<Link href="/sales" className="text-xs font-medium text-[#061161] hover:underline">Sales history</Link>}
        >
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded-full bg-[#EDEFF9]" />
              ))}
            </div>
          ) : !data || data.recent_sales.length === 0 ? (
            <EmptyState message="No sales recorded yet" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className="bg-[#FAFAFC] px-5 py-2.5 text-left text-xs font-semibold text-[#4A5060]">Receipt</th>
                  <th scope="col" className="bg-[#FAFAFC] px-5 py-2.5 text-left text-xs font-semibold text-[#4A5060]">Time</th>
                  <th scope="col" className="bg-[#FAFAFC] px-5 py-2.5 text-left text-xs font-semibold text-[#4A5060]">Cashier</th>
                  <th scope="col" className="bg-[#FAFAFC] px-5 py-2.5 text-right text-xs font-semibold text-[#4A5060]">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_sales.map((s) => (
                  <tr key={s.receipt_number} className="border-t border-[#DADDE6] transition hover:bg-[#FAFAFC]">
                    <td className="px-5 py-3 font-medium text-[#061161]">{s.receipt_number}</td>
                    <td className="px-5 py-3 text-[#4A5060]">
                      {new Date(s.sold_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 text-[#0B0E1A]">{s.cashier_name ?? "-"}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#0B0E1A]">
                      {cedi(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/* ------------------------------ tile icons ------------------------------- */

interface IP {
  className?: string;
}
const tile = (body: string) => ({ className }: IP) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: body }}
  />
);

const IconGrid = tile(
  '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
);
const IconBarcode = tile(
  '<path d="M3 5v14"/><path d="M6 5v14"/><path d="M10 5v14"/><path d="M14 5v14"/><path d="M18 5v14"/><path d="M21 5v14"/>',
);
const IconCartTile = tile(
  '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12A2 2 0 009.36 16.6h8.5A2 2 0 0019.8 15L21 7H6"/>',
);
const IconBell = tile(
  '<path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
);
const IconFolder = tile(
  '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
);
const IconCard = tile(
  '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
);
const IconUsers = tile(
  '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13A4 4 0 0119 7"/>',
);
const IconCog2 = tile(
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
);
const IconChartTile = tile('<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="13" y="7" width="3" height="10"/>');
const IconTruckTile = tile(
  '<rect x="1" y="5" width="14" height="11" rx="1"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
);
const IconHome = tile('<path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>');
const IconMoney = tile(
  '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
);
