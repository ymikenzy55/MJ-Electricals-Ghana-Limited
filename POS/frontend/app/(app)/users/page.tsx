"use client";

import { useCallback, useEffect, useState } from "react";
import { IconEye, IconEyeOff } from "@/components/Icons";
import { api, ApiError, getStoredUser } from "@/lib/api";
import { PageHeader, Pagination } from "@/components/ui";
import type { Branch, Role, UserManage } from "@/lib/types";

export default function UsersPage() {
  return <UsersManager />;
}

interface NewUser {
  username: string;
  full_name: string;
  email: string;
  password: string;
  role_id: number;
  branch_id: number | null;
}

const EMPTY: NewUser = {
  username: "",
  full_name: "",
  email: "",
  password: "",
  role_id: 0,
  branch_id: null,
};

interface ActivityItem {
  id: number;
  type: string;
  action: string;
  description: string;
  amount: string | null;
  status: string | null;
  created_at: string;
}

interface ActivitySummary {
  user_id: number;
  username: string;
  full_name: string;
  role_name: string;
  branch_name: string | null;
  sales_count: number;
  total_revenue: string;
  voided_count: number;
  returns_count: number;
  audit_count: number;
  items: ActivityItem[];
  total: number;
  page: number;
  page_size: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function UsersManager() {
  const me = getStoredUser();
  const [users, setUsers] = useState<UserManage[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewUser>(EMPTY);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<UserManage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Role change confirmation
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: UserManage; role: Role } | null>(null);
  const [roleChangeBusy, setRoleChangeBusy] = useState(false);

  // Activity modal
  const [activityUser, setActivityUser] = useState<UserManage | null>(null);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [activityPage, setActivityPage] = useState(1);

  const load = useCallback(async () => {
    const [u, r, b] = await Promise.all([
      api<UserManage[]>("/api/v1/users"),
      api<Role[]>("/api/v1/roles"),
      api<Branch[]>("/api/v1/branches"),
    ]);
    setUsers(u);
    setRoles(r);
    setBranches(b);
    if (form.role_id === 0 && r.length > 0) setForm((f) => ({ ...f, role_id: r[0].id }));
  }, [form.role_id]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load users"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openForm() {
    setForm({ ...EMPTY, role_id: roles[0]?.id ?? 0 });
    setShowForm(true);
    setError(null);
    setSuccess(null);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!form.role_id) {
      setError("Please choose a role");
      return;
    }
    setBusy(true);
    try {
      await api<UserManage>("/api/v1/users", {
        method: "POST",
        body: {
          username: form.username,
          full_name: form.full_name,
          email: form.email || null,
          password: form.password,
          role_id: form.role_id,
          branch_id: form.branch_id,
        },
      });
      setSuccess(`User "${form.username}" created successfully.`);
      setShowForm(false);
      setForm({ ...EMPTY, role_id: roles[0]?.id ?? 0 });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserManage) {
    setError(null);
    setSuccess(null);
    try {
      await api<UserManage>(`/api/v1/users/${u.id}`, {
        method: "PATCH",
        body: { is_active: !u.is_active },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    }
  }

  function changeRole(u: UserManage, roleId: number) {
    if (roleId === 0) return;
    // Find the role for comparison
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.name === u.role_name) return;
    setError(null);
    setSuccess(null);
    // Ask permission first - show confirmation modal
    setRoleChangeTarget({ user: u, role });
  }

  async function confirmRoleChange() {
    if (!roleChangeTarget) return;
    const { user: u, role } = roleChangeTarget;
    setRoleChangeBusy(true);
    setError(null);
    setSuccess(null);
    // Optimistic update for instant reflection
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, role_name: role.name } : x)),
    );
    try {
      await api<UserManage>(`/api/v1/users/${u.id}`, {
        method: "PATCH",
        body: { role_id: role.id },
      });
      await load();
      setSuccess(`Role changed to "${role.name}" for ${u.full_name}.`);
      setRoleChangeTarget(null);
    } catch (err) {
      // Revert on failure
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, role_name: u.role_name } : x)),
      );
      setError(err instanceof ApiError ? err.message : "Failed to change role");
    } finally {
      setRoleChangeBusy(false);
    }
  }

  async function changeBranch(u: UserManage, branchId: number | null) {
    if (u.branch_id === branchId) return;
    setError(null);
    setSuccess(null);
    try {
      await api<UserManage>(`/api/v1/users/${u.id}`, {
        method: "PATCH",
        body: { branch_id: branchId },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change branch");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api(`/api/v1/users/${deleteTarget.id}`, { method: "DELETE" });
      setSuccess(`User "${deleteTarget.username}" deleted successfully.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete user");
    } finally {
      setDeleteBusy(false);
    }
  }

  const loadActivity = useCallback(
    async (userId: number, from: string, to: string, page: number) => {
      setActivityLoading(true);
      setActivityError(null);
      try {
        const params = new URLSearchParams();
        if (from) params.set("date_from", from);
        if (to) params.set("date_to", to);
        params.set("page", String(page));
        params.set("page_size", "20");
        const data = await api<ActivitySummary>(
          `/api/v1/users/${userId}/activity?${params.toString()}`,
        );
        setActivity(data);
      } catch (err) {
        setActivityError(err instanceof ApiError ? err.message : "Failed to load activity");
      } finally {
        setActivityLoading(false);
      }
    },
    [],
  );

  function openActivity(u: UserManage) {
    setActivityUser(u);
    setActivity(null);
    setActivityError(null);
    setActivityPage(1);
    // Default to last 30 days
    const today = todayISO();
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const from = thirtyAgo.toISOString().slice(0, 10);
    setDateFrom(from);
    setDateTo(today);
    loadActivity(u.id, from, today, 1);
  }

  function applyDateRange() {
    if (!activityUser) return;
    setActivityPage(1);
    loadActivity(activityUser.id, dateFrom, dateTo, 1);
  }

  const activityTotalPages = activity ? Math.max(1, Math.ceil(activity.total / activity.page_size)) : 1;

  return (
    <div className="min-h-full">
      <PageHeader
        title="Users & Permissions"
        breadcrumb="Users & Permissions"
        actions={
          <button
            onClick={openForm}
            className="rounded-xl bg-[#061161] px-4 py-2 text-sm font-medium text-white hover:bg-[#0A1C8C]"
          >
            + Add user
          </button>
        }
      />
      <div className="p-6">
      {error && (
        <div className="mb-4 rounded-xl border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-[#16803C]/30 bg-[#16803C]/10 px-3 py-2 text-sm text-[#16803C]">{success}</div>
      )}

      {showForm && (
        <form onSubmit={createUser} className="mb-6 rounded-xl border border-[#DADDE6] bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-[#0B0E1A]">New user</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Username *">
              <input
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]"
              />
            </Field>
            <Field label="Full name *">
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]"
              />
            </Field>
            <Field label="Password *">
              <div className="relative">
                <input
                  required
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 pr-10 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[#4A5060] hover:text-[#0B0E1A]"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Role *">
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Branch (optional, leave blank for all branches)">
              <select
                value={form.branch_id ?? ""}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#061161] px-4 py-2 text-sm font-medium text-white hover:bg-[#0A1C8C] disabled:opacity-50"
            >
              {busy ? "Creating..." : "Create user"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-[#DADDE6] px-4 py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-[#DADDE6] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFC] text-left text-xs text-[#4A5060]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Username / email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Branch</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Last login</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.username === me?.username;
              return (
                <tr key={u.id} className="border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => openActivity(u)}
                      className="font-medium text-[#061161] hover:underline text-left"
                      title="View user activity"
                    >
                      {u.full_name}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-[#0B0E1A]">
                    <div>{u.username}</div>
                    {u.email && <div className="text-xs text-[#4A5060]">{u.email}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={roles.find((r) => r.name === u.role_name)?.id ?? 0}
                      onChange={(e) => changeRole(u, Number(e.target.value))}
                      disabled={isSelf}
                      className="rounded-xl border border-[#DADDE6] px-2 py-1 text-xs text-[#0B0E1A] focus:border-[#061161] focus:outline-none disabled:bg-[#EDEFF9]"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.branch_id ?? ""}
                      onChange={(e) => changeBranch(u, e.target.value ? Number(e.target.value) : null)}
                      disabled={isSelf}
                      className="rounded-xl border border-[#DADDE6] px-2 py-1 text-xs text-[#0B0E1A] focus:border-[#061161] focus:outline-none disabled:bg-[#EDEFF9]"
                    >
                      <option value="">All branches</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={isSelf}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-60 ${
                        u.is_active
                          ? "bg-[#16803C]/15 text-[#16803C] hover:bg-[#16803C]/30"
                          : "bg-[#C62828]/15 text-[#C62828] hover:bg-[#C62828]/30"
                      }`}
                    >
                      {u.is_active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#4A5060]">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openActivity(u)}
                        className="rounded-xl border border-[#DADDE6] px-2.5 py-1 text-xs font-medium text-[#0B0E1A] hover:bg-[#EDEFF9] hover:border-[#061161]"
                        title="View activity"
                      >
                        Activity
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={isSelf}
                        className="rounded-xl border border-[#C62828]/30 px-2.5 py-1 text-xs font-medium text-[#C62828] hover:bg-[#C62828]/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={isSelf ? "You cannot delete your own account" : "Delete user"}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#DADDE6] bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-[#0B0E1A]">Delete user?</h2>
            <p className="mb-1 text-sm text-[#4A5060]">
              You are about to permanently delete:
            </p>
            <p className="mb-5 text-sm font-medium text-[#0B0E1A]">
              {deleteTarget.full_name} ({deleteTarget.username})
            </p>
            <p className="mb-5 text-xs text-[#C62828]">
              This action cannot be undone. The user's sales history and audit logs will remain for record-keeping.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                disabled={deleteBusy}
                className="flex-1 rounded-xl bg-[#C62828] py-2 text-sm font-medium text-white hover:bg-[#A32020] disabled:opacity-50"
              >
                {deleteBusy ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
                className="flex-1 rounded-xl border border-[#DADDE6] py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role change confirmation modal */}
      {roleChangeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#DADDE6] bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-[#0B0E1A]">Change role?</h2>
            <p className="mb-1 text-sm text-[#4A5060]">
              Change the role for:
            </p>
            <p className="mb-1 text-sm font-medium text-[#0B0E1A]">
              {roleChangeTarget.user.full_name} ({roleChangeTarget.user.username})
            </p>
            <div className="mb-5 mt-3 flex items-center gap-2 rounded-xl border border-[#DADDE6] bg-[#FAFAFC] px-3 py-2.5">
              <span className="text-sm text-[#4A5060]">
                {roleChangeTarget.user.role_name}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#061161]">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className="text-sm font-semibold text-[#061161]">
                {roleChangeTarget.role.name}
              </span>
            </div>
            <p className="mb-5 text-xs text-[#4A5060]">
              This will immediately update the user's permissions. The change takes effect on their next action.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmRoleChange}
                disabled={roleChangeBusy}
                className="flex-1 rounded-xl bg-[#061161] py-2 text-sm font-medium text-white hover:bg-[#0A1C8C] disabled:opacity-50"
              >
                {roleChangeBusy ? "Applying..." : "Yes, change role"}
              </button>
              <button
                onClick={() => setRoleChangeTarget(null)}
                disabled={roleChangeBusy}
                className="flex-1 rounded-xl border border-[#DADDE6] py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User activity modal */}
      {activityUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-[#DADDE6] bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#DADDE6] px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0B0E1A]">{activityUser.full_name}</h2>
                <p className="text-sm text-[#4A5060]">
                  {activityUser.username} - {activityUser.role_name}
                  {activityUser.branch_name ? ` - ${activityUser.branch_name}` : " - All branches"}
                </p>
              </div>
              <button
                onClick={() => setActivityUser(null)}
                className="text-[#4A5060] hover:text-[#0B0E1A]"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Date range filter */}
            <div className="flex flex-wrap items-end gap-3 border-b border-[#DADDE6] px-6 py-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4A5060]">From date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-xl border border-[#DADDE6] px-3 py-1.5 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4A5060]">To date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-xl border border-[#DADDE6] px-3 py-1.5 text-sm text-[#0B0E1A] focus:border-[#061161] focus:outline-none"
                />
              </div>
              <button
                onClick={applyDateRange}
                disabled={activityLoading}
                className="rounded-xl bg-[#061161] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#0A1C8C] disabled:opacity-50"
              >
                {activityLoading ? "Loading..." : "Apply"}
              </button>
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setActivityPage(1);
                  loadActivity(activityUser.id, "", "", 1);
                }}
                className="rounded-xl border border-[#DADDE6] px-3 py-1.5 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
              >
                All time
              </button>
            </div>

            {/* Summary stats */}
            {activity && (
              <div className="grid grid-cols-2 gap-3 px-6 py-3 sm:grid-cols-4">
                <div className="rounded-xl border border-[#DADDE6] bg-[#FAFAFC] px-3 py-2">
                  <div className="text-xs text-[#4A5060]">Sales</div>
                  <div className="text-lg font-semibold text-[#0B0E1A]">{activity.sales_count}</div>
                </div>
                <div className="rounded-xl border border-[#DADDE6] bg-[#FAFAFC] px-3 py-2">
                  <div className="text-xs text-[#4A5060]">Revenue</div>
                  <div className="text-lg font-semibold text-[#0B0E1A]">
                    {"\u20b5"} {parseFloat(activity.total_revenue || "0").toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="rounded-xl border border-[#DADDE6] bg-[#FAFAFC] px-3 py-2">
                  <div className="text-xs text-[#4A5060]">Voided</div>
                  <div className="text-lg font-semibold text-[#0B0E1A]">{activity.voided_count}</div>
                </div>
                <div className="rounded-xl border border-[#DADDE6] bg-[#FAFAFC] px-3 py-2">
                  <div className="text-xs text-[#4A5060]">Audit actions</div>
                  <div className="text-lg font-semibold text-[#0B0E1A]">{activity.audit_count}</div>
                </div>
              </div>
            )}

            {/* Activity list */}
            <div className="min-h-0 flex-1 overflow-auto px-6 py-3">
              {activityError ? (
                <p className="text-center text-sm text-[#C62828]">{activityError}</p>
              ) : activityLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[#EDEFF9]" />
                  ))}
                </div>
              ) : !activity || activity.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#4A5060]">
                  No activity found for the selected date range.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activity.items.map((item) => {
                    const isSale = item.type === "sale";
                    const isVoid = item.status === "VOIDED";
                    return (
                      <li
                        key={`${item.type}-${item.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#DADDE6] px-4 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
                              isSale
                                ? isVoid
                                  ? "bg-[#C62828]/15 text-[#C62828]"
                                  : "bg-[#EDEFF9] text-[#061161]"
                                : "bg-[#EDEFF9] text-[#4A5060]"
                            }`}
                          >
                            {isSale ? "$" : "*"}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#0B0E1A]">
                              {item.description}
                            </div>
                            <div className="text-xs text-[#4A5060]">
                              {new Date(item.created_at).toLocaleString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                        {item.amount && (
                          <div className={`flex-shrink-0 text-sm font-semibold ${
                            isVoid ? "text-[#C62828]" : "text-[#0B0E1A]"
                          }`}>
                            {"\u20b5"} {parseFloat(item.amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Pagination */}
            {activity && activity.total > activity.page_size && (
              <div className="flex items-center justify-between border-t border-[#DADDE6] px-6 py-3 text-sm text-[#4A5060]">
                <span>
                  {(activity.page - 1) * activity.page_size + 1}-{Math.min(activity.page * activity.page_size, activity.total)} of {activity.total}
                </span>
                <Pagination
                  className="mt-0"
                  page={activityPage}
                  pages={activityTotalPages}
                  onPage={(p) => {
                    setActivityPage(p);
                    loadActivity(activityUser.id, dateFrom, dateTo, p);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">{label}</span>
      {children}
    </label>
  );
}
