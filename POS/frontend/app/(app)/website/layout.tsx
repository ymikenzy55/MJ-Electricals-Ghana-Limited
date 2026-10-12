"use client";

import { useOffline } from "@/lib/offline-context";

/** Website management talks to the online store, so it needs the internet. */
export default function WebsiteAdminLayout({ children }: { children: React.ReactNode }) {
  const { online } = useOffline();
  return (
    <>
      {!online && (
        <div className="border-b border-warning/30 bg-warning/10 px-6 py-3 text-sm font-semibold text-warning" role="status">
          You&apos;re offline. Website orders, customers and settings need the internet. The register, stock and reports keep working, and this page updates when you reconnect.
        </div>
      )}
      {children}
    </>
  );
}
