"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getStoredUser } from "@/lib/api";
import { SkeletonTable } from "@/components/Skeleton";
import { PageHeader, Pagination } from "@/components/ui";

interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  branch_id: number | null;
  branch_name: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  is_offline: boolean;
  created_at: string;
}

interface PaginatedLogs {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

/* ------------------------------------------------------------------ *
 * Friendly translations for non-technical users
 * ------------------------------------------------------------------ */

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in attempt",
  "sale.created": "Completed a sale",
  "sale.voided": "Voided a sale",
  "return.processed": "Processed a return",
  "shift.opened": "Opened cash drawer",
  "shift.closed": "Closed cash drawer",
  "product.created": "Added a new product",
  "product.updated": "Updated a product",
  "variant.created": "Added a product variant",
  "import.products": "Imported products from file",
  "inventory.adjusted": "Adjusted stock levels",
  "customer.created": "Added a new customer",
  "customer.updated": "Updated a customer",
  "transfer.created": "Created a stock transfer",
  "transfer.approved": "Approved a stock transfer",
  "transfer.dispatched": "Dispatched a stock transfer",
  "transfer.received": "Received a stock transfer",
  "transfer.cancelled": "Cancelled a stock transfer",
  "purchase.created": "Recorded a stock purchase",
  "user.created": "Created a new user",
  "user.updated": "Updated a user account",
  "user.deleted": "Deleted a user account",
  "branch.created": "Created a new branch",
  "branch.updated": "Updated a branch",
};

const ENTITY_LABELS: Record<string, string> = {
  sale: "Sale",
  return: "Return",
  shift: "Cash drawer",
  product: "Product",
  variant: "Product variant",
  import: "Product import",
  branch_inventory: "Inventory",
  customer: "Customer",
  transfer: "Stock transfer",
  purchase: "Purchase",
  user: "User",
  branch: "Branch",
};

// Friendly field names for the change details.
const FIELD_LABELS: Record<string, string> = {
  username: "Username",
  full_name: "Full name",
  email: "Email",
  role_id: "Role",
  branch_id: "Branch",
  is_active: "Status",
  password: "Password",
  name: "Name",
  code: "Code",
  address: "Address",
  phone: "Phone",
  status: "Status",
  quantity: "Quantity",
  reason: "Reason",
  selling_price: "Selling price",
  cost_price: "Cost price",
  sku: "SKU",
  barcode: "Barcode",
  category: "Category",
  brand: "Brand",
  receipt_number: "Receipt number",
  payment_method: "Payment method",
  total: "Total",
  subtotal: "Subtotal",
  discount_amount: "Discount",
  tax_rate: "Tax rate",
  cash_taken: "Opening cash",
  closing_cash: "Closing cash",
  expected_cash: "Expected cash",
  difference: "Difference",
  notes: "Notes",
  label: "Label",
};

// Action categories for the filter dropdown.
const ACTION_CATEGORIES: { label: string; value: string }[] = [
  { label: "All activity", value: "" },
  { label: "Sign-in", value: "auth.login" },
  { label: "Sales", value: "sale.created" },
  { label: "Voided sales", value: "sale.voided" },
  { label: "Returns", value: "return.processed" },
  { label: "Cash drawer", value: "shift.opened" },
  { label: "Products", value: "product.created" },
  { label: "Inventory adjustments", value: "inventory.adjusted" },
  { label: "Stock transfers", value: "transfer.created" },
  { label: "Purchases", value: "purchase.created" },
  { label: "Customers", value: "customer.created" },
  { label: "Users", value: "user.created" },
  { label: "Branches", value: "branch.created" },
  { label: "Product imports", value: "import.products" },
];

// Badge tone per action category.
function actionTone(action: string): "blue" | "green" | "amber" | "red" | "slate" {
  if (action.startsWith("sale.created") || action.startsWith("shift.opened")) return "green";
  if (action.startsWith("sale.voided") || action.startsWith("auth.login_failed") || action.startsWith("user.deleted") || action.startsWith("transfer.cancelled")) return "red";
  if (action.startsWith("return") || action.startsWith("transfer") || action.startsWith("inventory")) return "amber";
  if (action.startsWith("auth.login") || action.startsWith("user") || action.startsWith("branch")) return "blue";
  return "slate";
}

function friendlyAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function friendlyEntity(entityType: string | null, entityId: string | null): string {
  if (!entityType) return "";
  const label = ENTITY_LABELS[entityType] ?? entityType;
  return entityId ? `${label} #${entityId}` : label;
}

function friendlyField(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "(none)";
  if (val === true) return "Yes";
  if (val === false) return "No";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/* ------------------------------------------------------------------ */

export default function AuditLogsPage() {
  return <AuditLogsScreen />;
}

function AuditLogsScreen() {
  const user = getStoredUser();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async (p: number, action: string) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = { page: p, page_size: pageSize };
      if (action) params.action = action;
      const data = await api<PaginatedLogs>("/api/v1/audit-logs", { params });
      setLogs(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, actionFilter);
  }, [page, actionFilter, load]);

  if (user && !user.permissions.includes("audit_logs.view")) {
    return <div className="p-8 text-[#4A5060]">You do not have permission to view audit logs.</div>;
  }

  return (
    <div className="min-h-full">
      <PageHeader title="Audit Logs" breadcrumb="Audit Logs" subtitle="A record of who did what and when" />

      <div className="p-6">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#4A5060]">Activity type</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="rounded-xl border border-[#DADDE6] bg-white px-3 py-2 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none"
            >
              {ACTION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => load(page, actionFilter)}
              disabled={loading}
              className="rounded-xl bg-[#061161] px-4 py-2 text-sm font-medium text-white hover:bg-[#0A1C8C] disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>
        )}

        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#4A5060]">No activity recorded yet</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#DADDE6] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#FAFAFC] text-left text-xs text-[#4A5060]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Who</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Activity</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Branch</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const tone = actionTone(log.action);
                    const toneClasses: Record<string, string> = {
                      blue: "bg-[#EDEFF9] text-[#061161]",
                      green: "bg-[#16803C]/15 text-[#16803C]",
                      amber: "bg-[#B7791F]/15 text-[#B7791F]",
                      red: "bg-[#C62828]/15 text-[#C62828]",
                      slate: "bg-[#EDEFF9] text-[#4A5060]",
                    };
                    const entity = friendlyEntity(log.entity_type, log.entity_id);
                    const hasDetails = log.old_value || log.new_value;
                    const isExpanded = expandedId === log.id;
                    return (
                      <tr key={log.id} className="border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
                        <td className="px-4 py-3 text-xs text-[#4A5060] whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#0B0E1A]">
                            {log.user_name ?? "System"}
                          </div>
                          {log.is_offline && (
                            <span className="text-xs text-[#B7791F]">Offline</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}>
                              {friendlyAction(log.action)}
                            </span>
                          </div>
                          {entity && (
                            <div className="mt-0.5 text-xs text-[#4A5060]">{entity}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#0B0E1A]">
                          {log.branch_name ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#4A5060]">
                          {hasDetails ? (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              className="font-medium text-[#061161] hover:underline"
                            >
                              {isExpanded ? "Hide changes" : "View changes"}
                            </button>
                          ) : (
                            <span className="text-[#4A5060]">-</span>
                          )}
                          {isExpanded && hasDetails && (
                            <div className="mt-2 space-y-1.5 rounded-xl border border-[#DADDE6] bg-[#FAFAFC] p-3">
                              {log.new_value &&
                                Object.entries(log.new_value).map(([key, val]) => {
                                  const oldVal = log.old_value?.[key];
                                  const changed = oldVal !== undefined && oldVal !== val;
                                  return (
                                    <div key={key} className="flex items-start gap-2 text-xs">
                                      <span className="font-medium text-[#0B0E1A] min-w-32">
                                        {friendlyField(key)}:
                                      </span>
                                      <span className="text-[#4A5060]">
                                        {changed ? (
                                          <>
                                            <span className="line-through opacity-60">{formatValue(oldVal)}</span>
                                            {" → "}
                                            <span className="font-medium text-[#16803C]">{formatValue(val)}</span>
                                          </>
                                        ) : (
                                          <span className="text-[#0B0E1A]">{formatValue(val)}</span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                })}
                              {log.old_value && !log.new_value &&
                                Object.entries(log.old_value).map(([key, val]) => (
                                  <div key={key} className="flex items-start gap-2 text-xs">
                                    <span className="font-medium text-[#0B0E1A] min-w-32">
                                      {friendlyField(key)}:
                                    </span>
                                    <span className="text-[#C62828] line-through">{formatValue(val)}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-[#4A5060]">
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)} of {total}
            </span>
            <Pagination className="mt-0" page={page} pages={totalPages} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
