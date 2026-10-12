"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader, cedi } from "@/components/ui";
import { fmt12, orderStatusColor } from "@/lib/website-helpers";
import {
  websiteApi,
  type WebsiteOrderListItem,
  type WebsiteUser,
} from "@/lib/website-api";

export default function WebsiteCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<WebsiteUser | null>(null);
  const [orders, setOrders] = useState<WebsiteOrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    websiteApi<WebsiteUser>(`/api/v1/admin/users/${id}`)
      .then(setUser)
      .catch(() => setError("Customer not found"));
    websiteApi<WebsiteOrderListItem[]>(`/api/v1/admin/users/${id}/orders`)
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [id]);

  const totalSpent = (orders ?? []).reduce((s, o) => s + parseFloat(o.total || "0"), 0);

  return (
    <div className="p-4 sm:p-6">
      {/* Breadcrumbs */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href="/website/customers" className="font-medium text-[#061161] hover:underline">
          Customers
        </Link>
        <span className="text-[#6B7183]">/</span>
        <span className="font-medium text-[#0B0E1A]">{user?.full_name ?? "…"}</span>
      </div>

      {error ? (
        <div className="rounded-xl border border-[#C62828]/30 bg-[#C62828]/10 p-10 text-center text-[#C62828]">{error}</div>
      ) : !user ? (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">Loading customer…</div>
      ) : (
        <>
          <PageHeader title={user.full_name} breadcrumb="Website / Customers" subtitle="Website customer details and activity" />

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Customer details */}
            <div className="lg:col-span-1">
              <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Customer Details</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[#4A5060]">Name</dt>
                    <dd className="font-medium text-[#0B0E1A]">{user.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#4A5060]">Email</dt>
                    <dd className="font-medium text-[#0B0E1A]">{user.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#4A5060]">Phone</dt>
                    <dd className="font-medium text-[#0B0E1A]">{user.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#4A5060]">Address</dt>
                    <dd className="font-medium text-[#0B0E1A]">{user.address ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#4A5060]">Joined</dt>
                    <dd className="font-medium text-[#0B0E1A]">{fmt12(user.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#4A5060]">Status</dt>
                    <dd>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.is_active ? "bg-[#16803C]/15 text-[#16803C]" : "bg-[#C62828]/15 text-[#C62828]"}`}>
                        {user.is_active ? "Active" : "Disabled"}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Activity summary */}
              <div className="mt-4 rounded-xl border border-[#DADDE6] bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Activity Summary</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[#4A5060]">Total orders</dt>
                    <dd className="font-semibold tabular-nums text-[#0B0E1A]">{orders?.length ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#4A5060]">Total spent</dt>
                    <dd className="font-semibold tabular-nums text-[#0B0E1A]">{cedi(totalSpent)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#4A5060]">Last order</dt>
                    <dd className="font-medium text-[#0B0E1A]">
                      {orders && orders.length > 0 ? fmt12(orders[0].created_at) : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Order activity */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Order History</h3>
                {orders === null ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-10 animate-pulse rounded bg-[#EDEFF9]" />
                    ))}
                  </div>
                ) : orders.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-[#4A5060]">
                      <tr>
                        <th className="py-2">Order No.</th>
                        <th className="py-2">Date</th>
                        <th className="py-2 text-center">Items</th>
                        <th className="py-2 text-right">Total</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-t border-[#DADDE6]">
                          <td className="py-2 font-medium text-[#061161]">{o.order_number}</td>
                          <td className="py-2 text-[#4A5060]">{fmt12(o.created_at)}</td>
                          <td className="py-2 text-center text-[#4A5060]">{o.items_count}</td>
                          <td className="py-2 text-right font-semibold">{cedi(o.total)}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusColor(o.status)}`}>{o.status}</span>
                          </td>
                          <td className="py-2 text-[#4A5060]">{o.payment_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-8 text-center text-[#6B7183]">No orders yet</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
