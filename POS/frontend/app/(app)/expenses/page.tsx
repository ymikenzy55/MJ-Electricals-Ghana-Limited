"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getStoredUser } from "@/lib/api";
import { Alert, Button, EmptyState, Field, PageHeader, Pagination, StatCard, TableShell, Td, Th, cedi } from "@/components/ui";

interface Expense {
  id: number; branch_id: number; user_id: number; user_name: string | null; shift_id: number | null;
  category: string; description: string | null; amount: string; paid_via: string; reference: string | null;
  expense_date: string; status: string; void_reason: string | null; created_at: string;
}
interface ExpenseList {
  items: Expense[]; total: number; total_amount: string; by_category: Record<string, string>; page: number; page_size: number;
}
interface Branch { id: number; name: string }

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA"); };
const inputCls = "w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none focus:ring-2 focus:ring-[#061161]/20";

export default function ExpensesPage() {
  const user = getStoredUser();
  const canManage = user?.permissions.includes("expenses.manage") ?? false;
  const [data, setData] = useState<ExpenseList | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | "">(user?.branch_id ?? "");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "", description: "", amount: "", paid_via: "CASH", reference: "", expense_date: today() });
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<ExpenseList>("/api/v1/expenses", {
        params: { branch_id: branchId || undefined, date_from: from, date_to: to, category: category || undefined, page, page_size: 25 },
      });
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load expenses");
    }
  }, [branchId, from, to, category, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<string[]>("/api/v1/expenses/categories").then((c) => { setCategories(c); setForm((f) => ({ ...f, category: f.category || c[0] })); }).catch(() => {});
    if (user?.branch_id === null) api<Branch[]>("/api/v1/branches").then((b) => { setBranches(b); setBranchId((cur) => cur || b[0]?.id || ""); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const branch = user?.branch_id ?? branchId;
    if (!branch) { setError("Choose a branch first"); return; }
    setSaving(true); setError(null);
    try {
      await api("/api/v1/expenses", {
        method: "POST",
        body: {
          branch_id: branch, category: form.category, description: form.description.trim() || null,
          amount: parseFloat(form.amount).toFixed(2), paid_via: form.paid_via,
          reference: form.reference.trim() || null, expense_date: form.expense_date,
        },
      });
      setForm({ ...form, description: "", amount: "", reference: "" });
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the expense");
    } finally { setSaving(false); }
  }

  async function confirmVoid() {
    if (!voiding) return;
    try {
      await api(`/api/v1/expenses/${voiding.id}/void`, { method: "POST", body: { reason: reason.trim() } });
      setVoiding(null); setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not void the expense");
      setVoiding(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const top = data ? Object.entries(data.by_category).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1])) : [];

  return (
    <div className="min-h-full bg-[#EDEFF9]">
      <PageHeader title="Expenses" breadcrumb="Sales / Expenses" subtitle="Petty cash and running costs. Cash paid from the drawer reduces the expected cash when the shift closes." />
      <div className="space-y-6 p-4 sm:p-6">
        {error && <Alert>{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total expenses (filtered)" value={data ? cedi(data.total_amount) : "—"} loading={!data} hint={`${data?.total ?? 0} record(s)`} />
          <StatCard label="Largest category" value={top[0]?.[0] ?? "—"} loading={!data} hint={top[0] ? cedi(top[0][1]) : undefined} />
          <StatCard label="Categories used" value={top.length} loading={!data} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {canManage && (
            <form onSubmit={save} className="h-fit space-y-3 rounded-xl border border-[#DADDE6] bg-white p-5">
              <h2 className="text-base font-semibold text-[#0B0E1A]">Record an expense</h2>
              {user?.branch_id === null && (
                <Field label="Branch" required>
                  <select value={branchId} onChange={(e) => setBranchId(parseInt(e.target.value) || "")} className={inputCls}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Category" required>
                <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Amount (₵)" required>
                <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Paid via">
                  <select value={form.paid_via} onChange={(e) => setForm({ ...form, paid_via: e.target.value })} className={inputCls}>
                    <option value="CASH">Cash (drawer)</option><option value="MOMO">Mobile money</option><option value="BANK">Bank</option>
                  </select>
                </Field>
                <Field label="Date"><input type="date" max={today()} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Description"><input maxLength={255} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="What was it for?" /></Field>
              <Field label="Reference / receipt no."><input maxLength={64} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} /></Field>
              <Button type="submit" disabled={saving || !form.amount} className="w-full">{saving ? "Saving…" : "Save expense"}</Button>
              {form.paid_via === "CASH" && <p className="text-xs text-[#6B7183]">Cash expenses are linked to your open shift, if you have one.</p>}
            </form>
          )}

          <div className={canManage ? "space-y-4 lg:col-span-2" : "space-y-4 lg:col-span-3"}>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#DADDE6] bg-white p-4">
              {user?.branch_id === null && (
                <Field label="Branch">
                  <select value={branchId} onChange={(e) => { setBranchId(parseInt(e.target.value) || ""); setPage(1); }} className={inputCls}>
                    <option value="">All branches</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="From"><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={inputCls} /></Field>
              <Field label="To"><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={inputCls} /></Field>
              <Field label="Category">
                <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={inputCls}>
                  <option value="">All</option>{categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            {!data ? <EmptyState message="Loading…" /> : data.items.length === 0 ? (
              <div className="rounded-xl border border-[#DADDE6] bg-white"><EmptyState message="No expenses in this period." /></div>
            ) : (
              <>
                <TableShell>
                  <table className="w-full">
                    <thead><tr><Th>Date</Th><Th>Category</Th><Th>Details</Th><Th>Paid via</Th><Th className="text-right">Amount</Th><Th>{""}</Th></tr></thead>
                    <tbody>
                      {data.items.map((x) => (
                        <tr key={x.id} className={x.status === "VOIDED" ? "opacity-50" : ""}>
                          <Td className="whitespace-nowrap">{new Date(x.expense_date + "T00:00").toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</Td>
                          <Td className="font-medium">{x.category}</Td>
                          <Td>{x.description || "—"}<div className="text-xs text-[#6B7183]">{x.user_name}{x.reference ? ` · ${x.reference}` : ""}{x.status === "VOIDED" ? ` · VOIDED: ${x.void_reason}` : ""}</div></Td>
                          <Td>{x.paid_via === "MOMO" ? "MoMo" : x.paid_via === "BANK" ? "Bank" : "Cash"}</Td>
                          <Td className={`text-right font-semibold tabular-nums ${x.status === "VOIDED" ? "line-through" : ""}`}>{cedi(x.amount)}</Td>
                          <Td className="text-right">{canManage && x.status === "ACTIVE" && <button onClick={() => { setVoiding(x); setReason(""); }} className="text-xs font-semibold text-[#C62828] hover:underline">Void</button>}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
                {pages > 1 && <Pagination page={page} pages={pages} onPage={setPage} />}
              </>
            )}

            {top.length > 0 && (
              <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold text-[#0B0E1A]">Spending by category</h3>
                <div className="space-y-2">
                  {top.map(([c, v]) => (
                    <div key={c}>
                      <div className="flex justify-between text-xs"><span className="font-medium text-[#0B0E1A]">{c}</span><span className="tabular-nums text-[#4A5060]">{cedi(v)}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-[#EDEFF9]"><div className="h-2 rounded-full bg-[#061161]" style={{ width: `${(parseFloat(v) / parseFloat(top[0][1])) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {voiding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setVoiding(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Void expense</h3>
            <p className="mt-1 text-sm text-[#4A5060]">{voiding.category}, {cedi(voiding.amount)}</p>
            <div className="mt-4"><Field label="Reason" required><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field></div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoiding(null)}>Cancel</Button>
              <Button variant="danger" disabled={reason.trim().length < 3} onClick={confirmVoid}>Void expense</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
