"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useEffect, useState, type ReactNode } from "react";

interface NavItem { href: string; label: string; icon: string; exact?: boolean; badge?: "signups" | "leave" }
interface NavGroup { label: string; items: NavItem[] }

const I = {
  home: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10",
  people: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  leave: "M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
  loan: "M17 9V7a5 5 0 00-10 0v2M5 9h14l1 12H4L5 9z",
  today: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  month: "M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  qr: "M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13h3",
  pin: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
  list: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4",
  pay: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  receipt: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  cog: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};

const NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: I.home }] },
  {
    label: "People",
    items: [
      { href: "/employees", label: "Employees", icon: I.people, badge: "signups" },
      { href: "/leave", label: "Leave", icon: I.leave, badge: "leave" },
      { href: "/loans", label: "Loans & Advances", icon: I.loan },
    ],
  },
  {
    label: "Attendance",
    items: [
      { href: "/attendance/today", label: "Today", icon: I.today },
      { href: "/attendance/monthly", label: "Monthly Report", icon: I.month },
      { href: "/attendance/qr", label: "Wall QR Code", icon: I.qr },
      { href: "/attendance/scans", label: "Scan Log", icon: I.pin },
      { href: "/attendance", label: "Records", icon: I.list, exact: true },
    ],
  },
  {
    label: "Payroll",
    items: [
      { href: "/payroll", label: "Payroll Runs", icon: I.pay },
      { href: "/payments", label: "Payment Log", icon: I.receipt },
    ],
  },
  {
    label: "Insights & Admin",
    items: [
      { href: "/reports", label: "Reports", icon: I.month },
      { href: "/settings", label: "Settings", icon: I.cog },
      { href: "/audit", label: "Audit Trail", icon: I.shield },
    ],
  },
];

const ALL = NAV.flatMap((g) => g.items);
const isActive = (path: string, it: NavItem) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/"));

function titleFor(path: string) {
  const hit = ALL.filter((i) => isActive(path, i)).sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.label ?? "Payroll & Attendance";
}

/**
 * Reloads the open page when payroll data changes anywhere (a worker scan,
 * a leave request, another admin's edit). Waits while a dialog is open or a
 * field is being edited so nothing in progress is lost.
 */
function LiveBoundary({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!token) return;
    let last: string | null = null;
    let pending = false;
    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      const typing = !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
      return typing || !!document.querySelector(".fixed.inset-0");
    };
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const { v } = await api.stamp(token!);
        if (last !== null && v !== last) pending = true;
        last = v;
      } catch { /* offline, try later */ }
      if (pending && !busy()) { pending = false; setKey((k) => k + 1); window.dispatchEvent(new Event("mj:payroll-changed")); }
    }
    check();
    const id = setInterval(check, 6000);
    return () => clearInterval(id);
  }, [token]);
  return <div key={key} className="contents">{children}</div>;
}

function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { token, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ signups: 0, leave: 0 });
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // numbers on the menu: sign ups waiting for approval, leave waiting for a decision
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = () => {
      Promise.all([api.dashboard(token), api.employees(token, { status: "PENDING" })])
        .then(([s, p]) => { if (alive) setCounts({ signups: p.length, leave: s.pending_leave ?? 0 }); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    window.addEventListener("mj:payroll-changed", load);
    return () => { alive = false; clearInterval(id); window.removeEventListener("mj:payroll-changed", load); };
  }, [token]);

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
      {NAV.map((g) => (
        <div key={g.label} className="mt-4 first:mt-1">
          <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">{g.label}</p>
          {g.items.map((item) => {
            const active = isActive(pathname, item);
            const n = item.badge ? counts[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition ${
                  active ? "bg-white font-bold text-primary shadow-sm" : "font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon d={item.icon} />
                <span className="flex-1">{item.label}</span>
                {n > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${active ? "bg-primary text-white" : "bg-error text-white"}`}>{n}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/MJ_Logo.jpg" alt="MJ Electricals" className="h-10 w-10 flex-shrink-0 rounded-lg" />
      <span className="leading-tight">
        <span className="block text-[14px] font-extrabold tracking-wide text-white">MJ ELECTRICALS</span>
        <span className="block text-[9.5px] font-semibold tracking-[0.18em] text-white/55">PAYROLL &amp; ATTENDANCE</span>
      </span>
    </div>
  );

  const signOut = (
    <div className="border-t border-white/10 p-3">
      <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-semibold text-white/80 hover:bg-white/10 hover:text-white">
        <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-primary lg:flex">
        {brand}
        {nav}
        {signOut}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-primary shadow-2xl">
            {brand}
            {nav}
            {signOut}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink hover:bg-surface lg:hidden" aria-label="Open menu">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <p className="text-[17px] font-extrabold tracking-tight text-ink">{titleFor(pathname)}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-success sm:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-success" />Live</span>
            {now && (
              <span className="hidden text-xs font-medium text-muted md:block">
                {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            )}
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary" title="Administrator">A</span>
          </div>
        </header>

        <main className="min-w-0 flex-1"><LiveBoundary>{children}</LiveBoundary></main>
      </div>
    </div>
  );
}
