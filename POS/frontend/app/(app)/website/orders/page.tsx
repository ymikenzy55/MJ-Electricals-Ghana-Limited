"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Pagination, cedi } from "@/components/ui";
import { fmt12, NEXT_STATUSES, orderStatusColor, ORDER_STATUSES } from "@/lib/website-helpers";
import {
  websiteApi,
  WebsiteApiError,
  type WebsiteOrder,
  type WebsiteOrderListItem,
} from "@/lib/website-api";

export default function WebsiteOrdersPage() {
  const [orders, setOrders] = useState<WebsiteOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [payFilter, setPayFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [payRef, setPayRef] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<WebsiteOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (s: string, p: number, q: string, pay: string) => {
    // (no spinner on refresh, the list updates in place)
    try {
      const filters: Record<string, string> = {};
      if (s) filters.status = s;
      if (q) filters.q = q;
      if (pay) filters.payment_status = pay;
      const params: Record<string, string | number | boolean | undefined> = {
        ...filters,
        page: p,
        page_size: 20,
      };
      const [res, countRes, pending] = await Promise.all([
        websiteApi<WebsiteOrderListItem[]>("/api/v1/admin/orders", { params }),
        websiteApi<{ count: number }>("/api/v1/admin/orders/count", {
          params: filters,
        }),
        websiteApi<{ count: number }>("/api/v1/admin/notifications/pending-count"),
      ]);
      setOrders(res);
      setTotal(countRes.count);
      setPendingCount(pending.count);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(statusFilter, page, debounced, payFilter);
    // new website orders appear on their own
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(statusFilter, page, debounced, payFilter);
    }, 10000);
    return () => clearInterval(t);
  }, [statusFilter, page, debounced, payFilter, load]);

  const pages = Math.max(1, Math.ceil(total / 20));

  async function viewOrder(id: number) {
    setOrderLoading(true);
    try {
      const o = await websiteApi<WebsiteOrder>(`/api/v1/admin/orders/${id}`);
      setSelectedOrder(o);
      setPayRef(o.payment_reference ?? "");
      setCancelReason("");
      setError(null);
    } catch {
      /* ignore */
    } finally {
      setOrderLoading(false);
    }
  }

  async function patchOrder(id: number, body: Record<string, unknown>) {
    setUpdating(true);
    setError(null);
    try {
      const updated = await websiteApi<WebsiteOrder>(`/api/v1/admin/orders/${id}`, {
        method: "PATCH",
        body,
      });
      setSelectedOrder(updated);
      load(statusFilter, page, debounced, payFilter);
    } catch (e) {
      setError(e instanceof WebsiteApiError ? e.message : "Failed to update order");
    } finally {
      setUpdating(false);
    }
  }

  const changeStatus = (id: number, status: string) =>
    patchOrder(id, status === "CANCELLED" ? { status, cancel_reason: cancelReason.trim() || "Cancelled by store" } : { status });

  if (selectedOrder) {
    return (
      <div className="p-4 sm:p-6">
        {/* Breadcrumbs */}
        <div className="mb-4 flex items-center gap-2 text-sm">
          <button onClick={() => setSelectedOrder(null)} className="font-medium text-[#061161] hover:underline">
            Orders
          </button>
          <span className="text-[#6B7183]">/</span>
          <span className="font-medium text-[#0B0E1A]">{selectedOrder.order_number}</span>
        </div>

        {error && (
          <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-[#DADDE6] bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0B0E1A]">{selectedOrder.order_number}</h2>
                  <p className="text-sm text-[#4A5060]">{fmt12(selectedOrder.created_at)}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${orderStatusColor(selectedOrder.status)}`}>
                  {selectedOrder.status}
                </span>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl bg-[#FAFAFC] p-4 text-sm">
                <div>
                  <div className="text-xs text-[#4A5060]">Customer</div>
                  <div className="font-medium text-[#0B0E1A]">
                    {selectedOrder.guest_name ?? "Registered user"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Email</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedOrder.guest_email ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Phone</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedOrder.guest_phone ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-[#4A5060]">Address</div>
                  <div className="font-medium text-[#0B0E1A]">{selectedOrder.guest_address ?? "-"}</div>
                </div>
              </div>

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
                    {selectedOrder.items.map((i) => (
                      <tr key={i.id} className="border-t border-[#DADDE6]">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            {i.image_url ? (
                              <img src={i.image_url} alt={i.product_name} className="h-10 w-10 rounded-lg border border-[#DADDE6] object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded-lg border border-[#DADDE6] bg-[#FAFAFC]" />
                            )}
                            <div>
                              <div className="font-medium text-[#0B0E1A]">{i.product_name}</div>
                              <div className="text-xs text-[#4A5060]">{i.variant_name} · {i.sku}</div>
                              {i.option_label && (
                                <div className="text-xs font-medium text-[#C62828]">Option: {i.option_label}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{i.quantity}</td>
                        <td className="px-4 py-2 text-right">{cedi(i.unit_price)}</td>
                        <td className="px-4 py-2 text-right font-medium">{cedi(i.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
                <div className="flex justify-between text-[#4A5060]">
                  <span>Subtotal</span>
                  <span>{cedi(selectedOrder.subtotal)}</span>
                </div>
                {parseFloat(selectedOrder.discount_amount ?? "0") > 0 && (
                  <div className="flex justify-between text-[#16803C]">
                    <span>Discount ({selectedOrder.coupon_code})</span>
                    <span>-{cedi(selectedOrder.discount_amount!)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#4A5060]">
                  <span>Shipping</span>
                  <span>{cedi(selectedOrder.shipping_fee)}</span>
                </div>
                <div className="flex justify-between border-t border-[#DADDE6] pt-2 text-lg font-bold text-[#0B0E1A]">
                  <span>Total</span>
                  <span>{cedi(selectedOrder.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar - status management */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Order Status</h3>
              <div className="space-y-2">
                {ORDER_STATUSES.filter((s) => s === selectedOrder.status || NEXT_STATUSES[selectedOrder.status]?.includes(s)).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      if (s === "CANCELLED" && !confirm("Cancel this order? Reserved stock returns to inventory and a paid order is marked refunded.")) return;
                      changeStatus(selectedOrder.id, s);
                    }}
                    disabled={updating || selectedOrder.status === s}
                    className={`w-full rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      selectedOrder.status === s
                        ? "border-[#061161] bg-[#061161] text-white"
                        : s === "CANCELLED"
                          ? "border-[#C62828]/40 text-[#C62828] hover:bg-[#C62828]/5"
                          : "border-[#DADDE6] text-[#0B0E1A] hover:bg-[#FAFAFC]"
                    } disabled:cursor-not-allowed`}
                  >
                    {selectedOrder.status === s ? `Current: ${s}` : s === "SHIPPED" && selectedOrder.fulfilment_type === "PICKUP" ? "READY FOR PICKUP" : `Mark ${s}`}
                  </button>
                ))}
                {NEXT_STATUSES[selectedOrder.status]?.includes("CANCELLED") && (
                  <input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Cancellation reason (shown to customer)"
                    maxLength={200}
                    className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-xs"
                  />
                )}
                {NEXT_STATUSES[selectedOrder.status]?.length === 0 && (
                  <p className="text-xs text-[#6B7183]">This order is final and can no longer change status.</p>
                )}
              </div>
              {updating && <p className="mt-2 text-xs text-[#6B7183]">Updating...</p>}
            </div>

            <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase text-[#4A5060]">Payment</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#4A5060]">Method</dt>
                  <dd className="text-[#0B0E1A]">{selectedOrder.payment_method.replace(/_/g, " ")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#4A5060]">Status</dt>
                  <dd className="text-[#0B0E1A]">{selectedOrder.payment_status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#4A5060]">Fulfilment</dt>
                  <dd className="text-[#0B0E1A]">{selectedOrder.fulfilment_type}</dd>
                </div>
              </dl>
              {selectedOrder.status !== "CANCELLED" && (
                <div className="mt-4 space-y-2 border-t border-[#DADDE6] pt-4">
                  <input
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Payment reference (MoMo ID, bank ref…)"
                    maxLength={200}
                    className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-xs"
                  />
                  <div className="flex gap-2">
                    {selectedOrder.payment_status !== "PAID" && (
                      <button
                        disabled={updating}
                        onClick={() => patchOrder(selectedOrder.id, { payment_status: "PAID", payment_reference: payRef.trim() || undefined })}
                        className="flex-1 rounded-xl bg-[#16803C] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Mark as paid
                      </button>
                    )}
                    {selectedOrder.payment_status === "PAID" && (
                      <button
                        disabled={updating}
                        onClick={() => patchOrder(selectedOrder.id, { payment_status: "REFUNDED" })}
                        className="flex-1 rounded-xl border border-[#DADDE6] px-3 py-2 text-xs font-semibold text-[#0B0E1A] hover:bg-[#FAFAFC] disabled:opacity-50"
                      >
                        Mark refunded
                      </button>
                    )}
                    {payRef.trim() !== (selectedOrder.payment_reference ?? "") && (
                      <button
                        disabled={updating}
                        onClick={() => patchOrder(selectedOrder.id, { payment_reference: payRef.trim() })}
                        className="rounded-xl border border-[#DADDE6] px-3 py-2 text-xs font-semibold text-[#0B0E1A] hover:bg-[#FAFAFC]"
                      >
                        Save ref
                      </button>
                    )}
                  </div>
                </div>
              )}
              {selectedOrder.cancel_reason && (
                <p className="mt-3 rounded-lg bg-[#C62828]/10 px-3 py-2 text-xs text-[#C62828]">Cancelled: {selectedOrder.cancel_reason}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Website Orders"
        breadcrumb="Website / Orders"
        subtitle="Orders placed on the public website"
      />

      {pendingCount > 0 && (
        <div className="mb-4 rounded-xl border border-[#B7791F]/30 bg-[#B7791F]/10 px-4 py-3 text-sm font-medium text-[#8F5E18]">
          {pendingCount} order(s) pending review
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order no., name, email, phone…"
          className="w-64 rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm"
        />
        <select
          value={payFilter}
          onChange={(e) => { setPayFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm"
        >
          <option value="">Any payment</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-sm text-[#4A5060]">{total} order(s)</span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">Loading orders...</div>
      ) : orders.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#DADDE6] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
              <tr>
                <th className="px-4 py-2">Order No.</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Items</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Payment</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
                  <td className="px-4 py-2 font-medium text-[#061161]">{o.order_number}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{o.guest_name ?? "Registered user"}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{fmt12(o.created_at)}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{o.items_count}</td>
                  <td className="px-4 py-2 text-right font-semibold">{cedi(o.total)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusColor(o.status)}`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-2 text-[#4A5060]">{o.payment_status}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => viewOrder(o.id)}
                      disabled={orderLoading}
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
          No orders yet
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination className="mt-0" page={page} pages={pages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
