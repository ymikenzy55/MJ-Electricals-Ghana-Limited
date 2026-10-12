"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX } from "@/components/Icons";
import { api, ApiError, getStoredUser } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { PageHeader } from "@/components/ui";

const TYPES = ["INDIVIDUAL", "CONTRACTOR", "BUSINESS", "OTHER"];

export default function CustomersPage() {
  return <CustomersScreen />;
}

function CustomersScreen() {
  const user = getStoredUser();
  const canCreate = user?.permissions.includes("customers.create") ?? false;
  const canUpdate = user?.permissions.includes("customers.update") ?? false;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [custType, setCustType] = useState("INDIVIDUAL");
  const [busy, setBusy] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await api<Customer[]>("/api/v1/customers", {
        params: { q: q || undefined, limit: 50 },
      });
      if (!controller.signal.aborted) setCustomers(data);
    } catch (e) {
      if (!controller.signal.aborted) {
        setCustomers([]);
        setError(e instanceof ApiError ? e.message : "Failed to load customers");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(search), 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [search, load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCustType("INDIVIDUAL");
    setShowForm(true);
    setError(null);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setAddress(c.address ?? "");
    setCustType(c.customer_type);
    setShowForm(true);
    setError(null);
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      customer_type: custType,
    };
    try {
      if (editing) {
        await api<Customer>(`/api/v1/customers/${editing.id}`, { method: "PATCH", body });
        setSuccess(`Updated ${body.name}`);
      } else {
        await api<Customer>("/api/v1/customers", { method: "POST", body });
        setSuccess(`Added ${body.name}`);
      }
      setShowForm(false);
      await load(search);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the customer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-[#EDEFF9]">
      <PageHeader
        title="Customers"
        breadcrumb="Customers"
        subtitle="Keep contact details for receipts, credit and follow-up"
        actions={
          canCreate && (
            <button
              onClick={openCreate}
              className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C]"
            >
              + Add customer
            </button>
          )
        }
      />

      <div className="p-6">
        {success && (
          <div className="mb-4 rounded border border-[#16803C]/30 bg-[#16803C]/10 px-4 py-2.5 text-sm text-[#16803C]">
            {success}
          </div>
        )}
        {error && !showForm && (
          <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-4 py-2.5 text-sm text-[#C62828]">
            {error}
          </div>
        )}

        <div className="mb-4 max-w-md">
          <label htmlFor="csearch" className="sr-only">
            Search customers
          </label>
          <input
            id="csearch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded border border-[#DADDE6] bg-white px-3 py-2 text-sm focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]"
          />
        </div>

        <section className="rounded-xl border border-[#DADDE6] bg-white">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-full bg-[#EDEFF9]" />
                ))}
              </div>
            ) : customers.length === 0 ? (
              <p className="p-10 text-center text-sm text-[#6B7183]">
                {search ? "No customers match your search" : "No customers yet"}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                  <tr>
                    <th scope="col" className="px-5 py-2.5">Name</th>
                    <th scope="col" className="px-5 py-2.5">Phone</th>
                    <th scope="col" className="px-5 py-2.5">Email</th>
                    <th scope="col" className="px-5 py-2.5">Type</th>
                    <th scope="col" className="px-5 py-2.5">Address</th>
                    {canUpdate && <th scope="col" className="px-5 py-2.5 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-t border-[#DADDE6]">
                      <td className="px-5 py-2.5 font-medium text-[#0B0E1A]">{c.name}</td>
                      <td className="px-5 py-2.5 text-[#4A5060]">{c.phone ?? "-"}</td>
                      <td className="px-5 py-2.5 text-[#4A5060]">{c.email ?? "-"}</td>
                      <td className="px-5 py-2.5">
                        <span className="rounded-full bg-[#EDEFF9] px-2 py-0.5 text-xs font-semibold text-[#4A5060]">
                          {c.customer_type}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-5 py-2.5 text-[#4A5060]">
                        {c.address ?? "-"}
                      </td>
                      {canUpdate && (
                        <td className="px-5 py-2.5 text-right">
                          <button
                            onClick={() => openEdit(c)}
                            className="text-sm font-medium text-[#061161] hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Edit customer" : "Add customer"}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-[#0B0E1A]">
                {editing ? "Edit customer" : "Add customer"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-[#6B7183] hover:text-[#4A5060]"
                aria-label="Close"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <Field label="Name" required>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                  />
                </Field>
                <Field label="Type">
                  <select
                    value={custType}
                    onChange={(e) => setCustType(e.target.value)}
                    className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                />
              </Field>
              <Field label="Address">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                />
              </Field>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={save}
                disabled={busy || !name.trim()}
                className="flex-1 rounded-full bg-[#061161] py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50"
              >
                {busy ? "Saving..." : editing ? "Save changes" : "Add customer"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded border border-[#DADDE6] py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase text-[#4A5060]">
        {label}
        {required && <span className="text-[#C62828]"> *</span>}
      </span>
      {children}
    </label>
  );
}
