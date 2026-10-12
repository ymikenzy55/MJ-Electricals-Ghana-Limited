"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { fmt12 } from "@/lib/website-helpers";
import { websiteApi, type WebsiteUser } from "@/lib/website-api";

export default function WebsiteCustomersPage() {
  const [users, setUsers] = useState<WebsiteUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    websiteApi<WebsiteUser[]>("/api/v1/admin/users")
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Website Customers"
        breadcrumb="Website / Customers"
        subtitle="Registered customers on the public website"
      />

      {loading ? (
        <div className="rounded-xl border border-[#DADDE6] bg-white">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-[#DADDE6] px-4 py-3 last:border-0">
              <div className="h-4 w-40 animate-pulse rounded bg-[#EDEFF9]" />
              <div className="h-4 w-48 animate-pulse rounded bg-[#EDEFF9]" />
              <div className="h-4 w-28 animate-pulse rounded bg-[#EDEFF9]" />
            </div>
          ))}
        </div>
      ) : users.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#DADDE6] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Joined</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#DADDE6] hover:bg-[#FAFAFC]">
                  <td className="px-4 py-2 font-medium text-[#0B0E1A]">{u.full_name}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{u.email}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{u.phone}</td>
                  <td className="px-4 py-2 text-[#4A5060]">{fmt12(u.created_at)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? "bg-[#16803C]/15 text-[#16803C]" : "bg-[#C62828]/15 text-[#C62828]"}`}>
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/website/customers/${u.id}`}
                      className="rounded border border-[#DADDE6] px-3 py-1 text-xs font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-10 text-center text-[#6B7183]">
          No registered customers yet
        </div>
      )}
    </div>
  );
}
