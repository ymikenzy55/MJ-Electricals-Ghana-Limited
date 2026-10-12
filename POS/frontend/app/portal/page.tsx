"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearSession, getStoredUser, getToken } from "@/lib/api";
import type { UserInfo } from "@/lib/types";

const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL || "http://localhost:3001";
const PAYROLL_URL = process.env.NEXT_PUBLIC_PAYROLL_URL || "http://localhost:3002";
const WEBSITE_API = process.env.NEXT_PUBLIC_WEBSITE_API_URL || "http://localhost:8001";
const PAYROLL_API = process.env.NEXT_PUBLIC_PAYROLL_API_URL || "http://localhost:8002";

const svg = (children: ReactNode) => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

interface Module {
  key: string;
  title: string;
  tagline: string;
  desc: string;
  features: string[];
  cta: string;
  kind: "internal" | "external" | "sso";
  href: string;
  health?: string;
  tint: string; // icon tile gradient
  icon: ReactNode;
}

const MODULES: Module[] = [
  {
    key: "pos", title: "Point of Sale", tagline: "Sell · Stock · Report",
    desc: "Run the till, manage stock across branches and see how the business is doing.",
    features: ["Checkout", "Inventory", "Shifts", "Reports"], cta: "Open POS",
    kind: "internal", href: "/dashboard", tint: "from-[#061161] to-[#1B25A5]",
    icon: svg(<><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>),
  },
  {
    key: "website", title: "Website", tagline: "Online store",
    desc: "Fulfil web orders, manage customers, coupons, reviews and site content.",
    features: ["Orders", "Customers", "Coupons", "Settings"], cta: "Open storefront",
    kind: "external", href: WEBSITE_URL, health: `${WEBSITE_API}/api/v1/health`, tint: "from-[#780206] to-[#C62828]",
    icon: svg(<><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z" /></>),
  },
  {
    key: "payroll", title: "Payroll & Attendance", tagline: "People & pay",
    desc: "Track attendance and leave, then run payroll with SSNIT and PAYE handled.",
    features: ["Employees", "Attendance", "Payroll", "Reports"], cta: "Open payroll",
    kind: "sso", href: PAYROLL_URL, health: `${PAYROLL_API}/api/v1/health`, tint: "from-[#0A1C8C] to-[#2563EB]",
    icon: svg(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>),
  },
];

type Status = "checking" | "online" | "offline";

function useReachable(url?: string): Status {
  const [status, setStatus] = useState<Status>(url ? "checking" : "online");
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const ping = () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      // no-cors: we only need to know the server answered, not read the body
      fetch(url, { mode: "no-cors", cache: "no-store", signal: ctl.signal })
        .then(() => alive && setStatus("online"))
        .catch(() => alive && setStatus("offline"))
        .finally(() => clearTimeout(t));
    };
    ping();
    const id = setInterval(ping, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [url]);
  return status;
}

function StatusPill({ status }: { status: Status }) {
  const map = {
    checking: ["bg-slate-100 text-slate-500", "bg-slate-400", "Checking"],
    online: ["bg-emerald-50 text-emerald-700", "bg-emerald-500", "Online"],
    offline: ["bg-red-50 text-red-700", "bg-red-500", "Not running"],
  } as const;
  const [cls, dot, label] = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status === "online" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

function ModuleCard({ m, onOpen }: { m: Module; onOpen: () => void }) {
  const status = useReachable(m.health);
  const disabled = status === "offline";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/95 p-6 shadow-[0_10px_40px_-12px_rgba(0,0,0,.45)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,.55)]">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${m.tint}`} aria-hidden />
      <div className="flex items-start justify-between">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${m.tint} text-white shadow-md`}>{m.icon}</span>
        <StatusPill status={status} />
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6B7183]">{m.tagline}</p>
      <h2 className="mt-1 text-xl font-bold text-[#0B0E1A]">{m.title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[#4A5060]">{m.desc}</p>
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {m.features.map((f) => (
          <li key={f} className="rounded-full bg-[#F1F2F8] px-2.5 py-1 text-[11px] font-medium text-[#3B4160]">{f}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${m.tint} px-5 py-3 text-sm font-semibold text-white shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#061161] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {disabled ? "Server not running" : m.cta}
        {!disabled && (
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </button>
    </article>
  );
}

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    // Non-admin branch users belong in POS only, send them straight there.
    if (u.branch_id != null) { router.replace("/dashboard"); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  function open(m: Module) {
    if (m.kind === "sso") {
      // Hand the POS session to the payroll app so the admin isn't asked to sign in twice.
      const token = getToken();
      window.location.href = token ? `${m.href}/sso#token=${token}` : `${m.href}/login`;
    } else if (m.kind === "external") {
      window.open(m.href, "_blank", "noopener,noreferrer");
    } else {
      router.push(m.href);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#061161]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  const hour = now?.getHours() ?? 12;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const full = user.full_name || user.username;
  const first = /^system$/i.test(full.split(" ")[0]) ? full : full.split(" ")[0];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/new_image_background.jpg')" }} aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-[#040b3f]/80 via-black/60 to-black/80" aria-hidden />

      {/* Top bar */}
      <header className="relative z-10 border-b border-white/10 bg-black/20 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MJ_Logo.jpg" alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/20" />
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-wide text-white">MJ ELECTRICALS</p>
              <p className="text-[10px] font-medium tracking-[0.2em] text-white/55">GHANA LIMITED</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold text-white">{user.full_name || user.username}</p>
              <p className="text-[11px] text-white/55">{user.role_name}</p>
            </div>
            <button
              onClick={() => { clearSession(); router.replace("/login"); }}
              className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-10 sm:py-14">
        <div className="mb-8 text-center sm:mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            {now ? now.toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : " "}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{greeting}, {first}</h1>
          <p className="mt-2 text-sm text-white/70 sm:text-base">Choose where you&apos;d like to work today.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => <ModuleCard key={m.key} m={m} onOpen={() => open(m)} />)}
        </div>
      </main>

      <footer className="relative z-10 pb-6 text-center text-[11px] text-white/45">
        © {new Date().getFullYear()} MJ Electricals Ghana Limited · Changes you make appear across all modules automatically
      </footer>
    </div>
  );
}
