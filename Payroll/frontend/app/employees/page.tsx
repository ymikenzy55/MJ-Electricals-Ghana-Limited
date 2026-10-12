"use client";

import { useEffect, useState } from "react";
import { api, cedi, type Component, type Employee, type EmployeePayload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, EmptyState, Field, Modal, PageHeader, Spinner, inputCls } from "@/components/ui";

const EMPTY: EmployeePayload = {
  employee_code: "", full_name: "", email: "", phone: "", address: "",
  department: "", position: "", hire_date: "", salary_type: "MONTHLY",
  base_salary: 0, bank_name: "", bank_account: "", status: "ACTIVE",
  payment_method: "BANK", ssnit_number: "", tin_number: "", ssnit_exempt: false,
};

export default function EmployeesPage() {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dept, setDept] = useState("");
  const [modal, setModal] = useState<"new" | Employee | null>(null);
  const [form, setForm] = useState<EmployeePayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [comps, setComps] = useState<Component[]>([]);
  const [comp, setComp] = useState({ name: "", kind: "ALLOWANCE", amount: "", taxable: true });

  const load = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api.employees(token, { q: q || undefined, status: status || undefined, department: dept || undefined }),
      api.departments(token),
    ])
      .then(([e, d]) => { setEmployees(e); setDepartments(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [token, q, status, dept]);

  const pending = employees.filter((e) => e.status === "PENDING");
  async function decide(e: Employee, approve: boolean) {
    if (!token) return;
    try { if (approve) await api.approveEmployee(token, e.id); else await api.rejectEmployee(token, e.id); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update"); }
  }

  function openNew() { setForm(EMPTY); setFormError(null); setModal("new"); }
  function openEdit(e: Employee) {
    setForm({
      employee_code: e.employee_code, full_name: e.full_name, email: e.email || "",
      phone: e.phone || "", address: e.address || "", department: e.department || "",
      position: e.position || "", branch_id: e.branch_id, hire_date: e.hire_date || "",
      salary_type: e.salary_type, base_salary: parseFloat(e.base_salary),
      bank_name: e.bank_name || "", bank_account: e.bank_account || "", status: e.status,
      payment_method: e.payment_method || "BANK", ssnit_number: e.ssnit_number || "",
      tin_number: e.tin_number || "", ssnit_exempt: !!e.ssnit_exempt,
    });
    setFormError(null);
    setComps([]);
    if (token) api.components(token, e.id).then(setComps).catch(() => {});
    setModal(e);
  }

  async function addComp() {
    if (!token || modal === "new" || !modal) return;
    const amount = parseFloat(comp.amount);
    if (!comp.name.trim() || !(amount > 0)) return;
    try {
      await api.addComponent(token, (modal as Employee).id, { ...comp, name: comp.name.trim(), amount });
      setComp({ name: "", kind: "ALLOWANCE", amount: "", taxable: true });
      setComps(await api.components(token, (modal as Employee).id));
    } catch (e) { setFormError(e instanceof Error ? e.message : "Could not add"); }
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setFormError(null);
    try {
      const body: EmployeePayload = { ...form };
      if (!body.email) delete body.email;
      if (!body.hire_date) delete body.hire_date;
      if (!body.pin) delete body.pin;
      if (!body.termination_date) delete body.termination_date;
      if (modal === "new") await api.createEmployee(token, body);
      else await api.updateEmployee(token, (modal as Employee).id, body);
      setModal(null);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!token || !confirmDelete) return;
    try {
      await api.deleteEmployee(token, confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setConfirmDelete(null);
    }
  }

  const set = (k: keyof EmployeePayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Employees"
        breadcrumb="Payroll / Employees"
        subtitle={`${employees.length} employee${employees.length !== 1 ? "s" : ""}`}
        actions={<Button onClick={openNew}>+ Add Employee</Button>}
      />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, position…" className={`${inputCls} max-w-xs`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All statuses</option>
          <option value="PENDING">Waiting for approval</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="TERMINATED">Terminated</option>
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {error && <p className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      {pending.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">{pending.length} new sign up{pending.length > 1 ? "s" : ""} waiting for approval</p>
          <ul className="mt-2 divide-y divide-amber-200">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="text-sm"><p className="font-semibold text-ink">{p.full_name}</p><p className="text-xs text-muted">{p.employee_code} · {p.phone || "no phone"}{p.position ? ` · ${p.position}` : ""}</p></div>
                <div className="flex gap-2"><Button onClick={() => decide(p, true)}>Approve</Button><Button variant="secondary" onClick={() => decide(p, false)}>Decline</Button></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        {loading ? (
          <Spinner />
        ) : employees.length === 0 ? (
          <div className="p-6"><EmptyState title="No employees found" hint="Add your first employee to get started." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-semibold text-muted">
                <th className="px-5 py-3">Employee</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Salary</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface/60">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-ink">{e.full_name}</p>
                    <p className="text-xs text-faint">{e.phone || e.email || ""}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{e.employee_code}</td>
                  <td className="px-4 py-3 text-muted">{e.department || "—"}</td>
                  <td className="px-4 py-3 text-muted">{e.position || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {cedi(e.base_salary)}<span className="text-xs font-normal text-faint">/{e.salary_type === "DAILY" ? "day" : "mo"}</span>
                  </td>
                  <td className="px-4 py-3"><Badge status={e.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(e)} className="mr-2 text-xs font-semibold text-primary hover:underline">Edit</button>
                    <button onClick={() => setConfirmDelete(e)} className="text-xs font-semibold text-error hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <Modal title={modal === "new" ? "New Employee" : `Edit ${(modal as Employee).full_name}`} onClose={() => setModal(null)} wide>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Employee Code *"><input value={form.employee_code} onChange={set("employee_code")} className={inputCls} placeholder="MJ001" /></Field>
            <Field label="Full Name *"><input value={form.full_name} onChange={set("full_name")} className={inputCls} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={set("email")} className={inputCls} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={set("phone")} className={inputCls} /></Field>
            <Field label="Department"><input value={form.department} onChange={set("department")} className={inputCls} placeholder="e.g. Sales" /></Field>
            <Field label="Position"><input value={form.position} onChange={set("position")} className={inputCls} placeholder="e.g. Cashier" /></Field>
            <Field label="Hire Date"><input type="date" value={form.hire_date} onChange={set("hire_date")} className={inputCls} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={set("status")} className={inputCls}>
                <option value="PENDING">Waiting for approval</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="TERMINATED">Terminated</option>
              </select>
            </Field>
            <Field label="Salary Type">
              <select value={form.salary_type} onChange={set("salary_type")} className={inputCls}>
                <option value="MONTHLY">Monthly</option><option value="DAILY">Daily</option>
              </select>
            </Field>
            <Field label={form.salary_type === "DAILY" ? "Daily Rate (₵)" : "Base Salary (₵/month)"}>
              <input type="number" min="0" step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
            <Field label="Payment Method">
              <select value={form.payment_method} onChange={set("payment_method")} className={inputCls}>
                <option value="BANK">Bank transfer</option><option value="MOMO">Mobile money</option><option value="CASH">Cash</option>
              </select>
            </Field>
            <Field label={form.payment_method === "MOMO" ? "Network (MTN, Vodafone…)" : "Bank Name"}><input value={form.bank_name} onChange={set("bank_name")} className={inputCls} /></Field>
            <Field label={form.payment_method === "MOMO" ? "MoMo Number" : "Account Number"}><input value={form.bank_account} onChange={set("bank_account")} className={inputCls} /></Field>
            <Field label="SSNIT Number"><input value={form.ssnit_number} onChange={set("ssnit_number")} className={inputCls} /></Field>
            <Field label="TIN (GRA)"><input value={form.tin_number} onChange={set("tin_number")} className={inputCls} /></Field>
            <Field label="SSNIT">
              <label className="flex h-[42px] items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={!!form.ssnit_exempt} onChange={(e) => setForm({ ...form, ssnit_exempt: e.target.checked })} className="h-4 w-4 accent-primary" /> Exempt from SSNIT
              </label>
            </Field>
            {modal !== "new" && form.status === "TERMINATED" && (
              <Field label="Termination Date"><input type="date" value={form.termination_date ?? ""} onChange={set("termination_date")} className={inputCls} /></Field>
            )}
            <Field label={modal === "new" ? "Worker Portal PIN" : "Worker Portal PIN (leave blank to keep current)"}>
              <input value={form.pin ?? ""} onChange={set("pin")} className={inputCls} placeholder="4–6 digit PIN" inputMode="numeric" />
            </Field>
            <Field label="Portal Access">
              <div className="flex h-[42px] items-center text-sm text-muted">
                {modal !== "new" && (modal as Employee).has_pin ? "PIN set, worker can sign in" : modal === "new" ? "Set a PIN to enable worker login" : "No PIN set"}
              </div>
            </Field>
            <div className="sm:col-span-2"><Field label="Address"><input value={form.address} onChange={set("address")} className={inputCls} /></Field></div>
          </div>

          {modal !== "new" && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="mb-2 text-sm font-bold text-ink">Recurring allowances &amp; deductions</p>
              <p className="mb-3 text-xs text-muted">Added to every payroll run for this employee (transport, housing, union dues…).</p>
              {comps.map((c) => (
                <div key={c.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                  <span><span className="font-semibold text-ink">{c.name}</span> <span className="text-xs text-faint">{c.kind.toLowerCase()}{c.kind === "ALLOWANCE" ? (c.taxable ? " · taxable" : " · tax-free") : ""}</span></span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums font-semibold">{cedi(c.amount)}</span>
                    <button onClick={async () => { if (token) { await api.deleteComponent(token, (modal as Employee).id, c.id); setComps(await api.components(token, (modal as Employee).id)); } }} className="text-xs font-semibold text-error hover:underline">Remove</button>
                  </span>
                </div>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input value={comp.name} onChange={(e) => setComp({ ...comp, name: e.target.value })} placeholder="Name" className={`${inputCls} sm:col-span-2`} />
                <select value={comp.kind} onChange={(e) => setComp({ ...comp, kind: e.target.value })} className={inputCls}>
                  <option value="ALLOWANCE">Allowance</option><option value="DEDUCTION">Deduction</option>
                </select>
                <input type="number" min="0" step="0.01" value={comp.amount} onChange={(e) => setComp({ ...comp, amount: e.target.value })} placeholder="₵ amount" className={inputCls} />
                <Button variant="secondary" onClick={addComp} disabled={!comp.name.trim() || !(parseFloat(comp.amount) > 0)}>Add</Button>
              </div>
            </div>
          )}
          {formError && <p className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{formError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.employee_code || !form.full_name}>{saving ? "Saving…" : "Save Employee"}</Button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="Delete Employee" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted">
            Delete <span className="font-bold text-ink">{confirmDelete.full_name}</span> ({confirmDelete.employee_code})?
            Employees who already have payslips cannot be deleted, set their status to Terminated instead.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
