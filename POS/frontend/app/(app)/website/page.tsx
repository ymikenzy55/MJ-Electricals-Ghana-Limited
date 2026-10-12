"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, cedi } from "@/components/ui";
import { websiteApi, type WebsiteDashboardStats } from "@/lib/website-api";

export default function WebsiteOverviewPage() {
  const [stats, setStats] = useState<WebsiteDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    websiteApi<WebsiteDashboardStats>("/api/v1/admin/dashboard")
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const daily = stats?.daily ?? [];
  const maxRev = Math.max(...daily.map((d) => d.revenue), 1);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Website Overview" breadcrumb="Website / Overview" subtitle="Your online store at a glance" />

      {loading ? (
        <div className="text-[#6B7183]">Loading dashboard...</div>
      ) : !stats ? (
        <div className="rounded-xl border border-[#C62828]/30 bg-[#C62828]/10 p-6 text-sm text-[#C62828]">
          Could not reach the website backend. Make sure it is running on port 8001.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total Orders" value={String(stats.total_orders)} sub={`${stats.orders_last_30_days ?? 0} in last 30 days`} />
            <StatCard label="Pending Orders" value={String(stats.pending_orders)} accent="amber" />
            <StatCard label="Revenue (Paid)" value={cedi(stats.total_revenue)} accent="green" sub={`${cedi(stats.revenue_last_30_days ?? 0)} ordered in 30 days`} />
            <StatCard label="Customers" value={String(stats.total_customers)} />
            <StatCard label="Published Products" value={String(stats.total_products)} sub={stats.low_stock_products ? `${stats.low_stock_products} low on stock` : undefined} accent={stats.low_stock_products ? "amber" : undefined} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-[#DADDE6] bg-white p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold uppercase text-[#4A5060]">Orders, last 14 days</h3>
              {daily.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#6B7183]">No orders in the last two weeks.</p>
              ) : (
                <div className="mt-4 flex h-40 items-end gap-2">
                  {daily.map((d) => (
                    <div key={d.day} className="group flex flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.orders} order(s), ${cedi(d.revenue)}`}>
                      <div className="w-full rounded-t bg-[#061161]/80 transition group-hover:bg-[#061161]" style={{ height: `${Math.max((d.revenue / maxRev) * 100, 4)}%` }} />
                      <span className="mt-1 text-[10px] text-[#6B7183]">{d.day.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
              <h3 className="text-sm font-semibold uppercase text-[#4A5060]">Top products</h3>
              {(stats.top_products ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-[#6B7183]">No sales yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {stats.top_products!.map((p) => (
                    <li key={p.name} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-[#0B0E1A]">{p.name}</span>
                      <span className="shrink-0 font-semibold text-[#061161]">{cedi(p.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {(stats.unread_messages ?? 0) > 0 && (
            <Link href="/website/engagement" className="mt-6 block rounded-xl border border-[#B7791F]/30 bg-[#B7791F]/10 px-4 py-3 text-sm font-medium text-[#8F5E18] hover:bg-[#B7791F]/15">
              {stats.unread_messages} unread customer message{stats.unread_messages === 1 ? "" : "s"}, open Messages →
            </Link>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <QuickLink href="/website/orders" title="Manage Orders" description="Fulfil orders, record payments, cancel" />
            <QuickLink href="/website/customers" title="Customers" description="Registered customers and their orders" />
            <QuickLink href="/website/engagement" title="Coupons & Reviews" description="Discount codes, review moderation, messages" />
            <QuickLink href="/website/settings" title="Site Settings" description="Branding, shipping fees, announcements" />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "amber" | "green" }) {
  return (
    <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
      <div className="text-xs font-semibold uppercase text-[#4A5060]">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent === "amber" ? "text-[#B7791F]" : accent === "green" ? "text-[#16803C]" : "text-[#0B0E1A]"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#6B7183]">{sub}</div>}
    </div>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-xl border border-[#DADDE6] bg-white p-5 transition-colors hover:border-[#061161] hover:shadow-sm">
      <div className="font-semibold text-[#0B0E1A]">{title}</div>
      <div className="mt-1 text-sm text-[#4A5060]">{description}</div>
    </Link>
  );
}
