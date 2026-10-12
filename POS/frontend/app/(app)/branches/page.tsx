"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui";

export default function BranchesPage() {
  return (
    <BranchesManager />
  );
}

interface Branch {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

function BranchesManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const bs = await api<Branch[]>("/api/v1/branches", { params: { include_inactive: true } });
      setBranches(bs);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load branches");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditId(null);
    setCode(""); setName(""); setAddress(""); setPhone("");
    setShowForm(true);
    setError(null); setSuccess(null);
  }

  function openEdit(b: Branch) {
    setEditId(b.id);
    setCode(b.code); setName(b.name); setAddress(b.address ?? ""); setPhone(b.phone ?? "");
    setShowForm(true);
    setError(null); setSuccess(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!code || !name) { setError("Branch code and name are required"); return; }
    setBusy(true);
    try {
      const body = { code, name, address: address || null, phone: phone || null };
      if (editId) {
        await api(`/api/v1/branches/${editId}`, { method: "PATCH", body });
        setSuccess(`Branch "${name}" updated.`);
      } else {
        await api("/api/v1/branches", { method: "POST", body });
        setSuccess(`Branch "${name}" created.`);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save branch");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(b: Branch) {
    setError(null); setSuccess(null);
    try {
      await api(`/api/v1/branches/${b.id}`, { method: "PATCH", body: { is_active: !b.is_active } });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update branch");
    }
  }

  return (
    <div className="min-h-full">
      <PageHeader
        title="Branches"
        breadcrumb="Branches"
        actions={
          <button onClick={openAdd} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C]">
            + Add Branch
          </button>
        }
      />
      <div className="p-6">
      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}
      {success && <div className="mb-4 rounded border border-[#16803C]/30 bg-[#16803C]/10 px-3 py-2 text-sm text-[#16803C]">{success}</div>}

      {showForm && (
        <form onSubmit={save} className="mb-6 rounded-xl border border-[#DADDE6] bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase text-[#4A5060]">
            {editId ? "Edit Branch" : "New Branch"}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Code *</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ACC, KUM, TMA" className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Name *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accra Main Branch" className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +233 30 123 4567" className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">Address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, region" className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">
              {busy ? "Saving..." : editId ? "Update Branch" : "Create Branch"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded border border-[#DADDE6] px-4 py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded border border-[#DADDE6] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-t border-[#DADDE6]">
                <td className="px-4 py-2 font-mono font-medium text-[#061161]">{b.code}</td>
                <td className="px-4 py-2 font-medium text-[#0B0E1A]">{b.name}</td>
                <td className="px-4 py-2 text-[#4A5060]">{b.phone ?? "-"}</td>
                <td className="px-4 py-2 text-[#4A5060]">{b.address ?? "-"}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleActive(b)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.is_active ? "bg-[#16803C]/15 text-[#16803C] hover:bg-[#16803C]/30" : "bg-[#C62828]/15 text-[#C62828] hover:bg-[#C62828]/30"
                    }`}
                  >
                    {b.is_active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => openEdit(b)} className="rounded border border-[#DADDE6] px-2 py-1 text-xs font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[#6B7183]">No branches yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

