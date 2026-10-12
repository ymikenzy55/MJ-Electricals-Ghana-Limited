"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearWorkerSession, getWorkerToken } from "@/lib/worker";
import ScanSync from "@/components/ScanSync";

const TABS = [
  { href: "/worker/home", label: "Home", d: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/worker/scan", label: "Scan", d: "M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M4 12h16" },
  { href: "/worker/history", label: "History", d: "M12 8v4l3 2M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" },
  { href: "/worker/payslips", label: "Pay", d: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/worker/leave", label: "Leave", d: "M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" },
];

/** Mobile frame for every signed in worker page: header + bottom tab bar. */
export default function WorkerShell({ title, children, back }: { title: string; children: ReactNode; back?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getWorkerToken()) { router.replace("/worker"); return; }
    setReady(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/worker-sw.js", { scope: "/" }).catch(() => {});
  }, [router]);

  if (!ready) return <div className="min-h-screen bg-[#061161]" />;

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F9]">
      <header className="sticky top-0 z-30 bg-[#061161] text-white">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            {back && <Link href="/worker/home" aria-label="Back" className="-ml-1 rounded p-1 hover:bg-white/10"><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg></Link>}
            <h1 className="text-base font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/worker/account" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white">Account</Link>
            <button onClick={() => { clearWorkerSession(); router.replace("/worker"); }} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white">Sign out</button>
          </div>
        </div>
      </header>
      <ScanSync />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E7EB] bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Worker navigation">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            const scan = t.href === "/worker/scan";
            return (
              <Link key={t.href} href={t.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active ? "text-[#061161]" : "text-[#8A8F98]"}`}>
                <span className={scan ? "-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#061161] text-white shadow-lg ring-4 ring-[#F3F4F9]" : ""}>
                  <svg className={scan ? "h-5 w-5" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.d} /></svg>
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
