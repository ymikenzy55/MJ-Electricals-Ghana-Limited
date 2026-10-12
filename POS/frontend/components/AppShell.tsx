"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import OfflineBanner from "@/components/OfflineBanner";
import { useOffline } from "@/lib/offline-context";
import { clearSession, getStoredUser } from "@/lib/api";
import { websiteApi, WebsiteOrderListItem } from "@/lib/website-api";
import type { UserInfo } from "@/lib/types";
import {
  IconChart,
  IconCart,
  IconBox,
  IconStore,
  IconTruck,
  IconCog,
  IconChevronRight,
  IconLogout,
  IconGlobe,
} from "@/components/Icons";

interface NavItem {
  href: string;
  label: string;
  permission: string;
}

interface NavGroup {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    Icon: IconChart,
    items: [
      { href: "/dashboard", label: "Dashboard", permission: "reports.view" },
      { href: "/reports", label: "Reports", permission: "reports.view" },
      { href: "/expenses", label: "Expenses", permission: "expenses.view" },
    ],
  },
  {
    label: "Sales",
    Icon: IconCart,
    items: [
      { href: "/pos", label: "Register", permission: "sales.create" },
      { href: "/sales", label: "Sales History", permission: "sales.view" },
      { href: "/returns", label: "Returns & Refunds", permission: "sales.return" },
      { href: "/shifts", label: "Cash Drawer", permission: "shifts.operate" },
      { href: "/customers", label: "Customers", permission: "customers.view" },
    ],
  },
  {
    label: "Products & Stock",
    Icon: IconBox,
    items: [
      { href: "/products", label: "Products", permission: "products.view" },
      { href: "/inventory", label: "Stock Levels", permission: "inventory.view" },
      { href: "/stock-take", label: "Stock Take", permission: "inventory.adjust" },
      { href: "/transfers", label: "Branch Transfers", permission: "inventory.view" },
      { href: "/purchases", label: "Suppliers & Purchases", permission: "purchases.view" },
      { href: "/imports", label: "Import from Excel", permission: "products.create" },
    ],
  },
  {
    label: "Website",
    Icon: IconGlobe,
    items: [
      { href: "/website", label: "Overview", permission: "website.manage" },
      { href: "/website/orders", label: "Orders", permission: "website.manage" },
      { href: "/website/customers", label: "Customers", permission: "website.view" },
      { href: "/website/products", label: "Products", permission: "website.manage" },
      { href: "/website/engagement", label: "Coupons, Reviews & Messages", permission: "website.manage" },
      { href: "/website/settings", label: "Settings", permission: "website.manage" },
    ],
  },
  {
    label: "Administration",
    Icon: IconCog,
    items: [
      { href: "/branches", label: "Branches", permission: "branches.manage" },
      { href: "/users", label: "Users & Permissions", permission: "users.manage" },
      { href: "/audit-logs", label: "Audit Logs", permission: "audit_logs.view" },
      { href: "/settings", label: "Settings", permission: "settings.manage" },
    ],
  },
];

/**
 * Re-mounts the current page when synced data changes (a website order, stock
 * moved by another till …) so it reloads its own data, no manual refresh.
 * It never does this on the checkout screen, while a dialog is open, or while
 * someone is typing, so nothing in progress is lost; it catches up afterwards.
 */
function LiveBoundary({ children }: { children: React.ReactNode }) {
  const { dataVersion } = useOffline();
  const pathname = usePathname();
  const [shown, setShown] = useState(dataVersion);

  useEffect(() => {
    if (dataVersion === shown) return;
    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      const typing = !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
      const dialog = !!document.querySelector('[role="dialog"], [role="alertdialog"], .fixed.inset-0');
      return pathname.startsWith("/pos") || typing || dialog;
    };
    if (!busy()) { setShown(dataVersion); return; }
    const t = setInterval(() => { if (!busy()) { setShown(dataVersion); clearInterval(t); } }, 2000);
    return () => clearInterval(t);
  }, [dataVersion, shown, pathname]);

  return <div key={shown} className="contents">{children}</div>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [showSignOut, setShowSignOut] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [recentOrders, setRecentOrders] = useState<WebsiteOrderListItem[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    setReady(true);
    setCollapsed(localStorage.getItem("mj_sidebar_collapsed") === "1");
  }, [router]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("mj_sidebar_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  // Poll the website backend for pending orders (website admins only).
  useEffect(() => {
    if (!user || !user.permissions.includes("website.manage")) return;
    setSeenAt(localStorage.getItem("mj_orders_seen_at"));
    let alive = true;
    const fetchPending = () => {
      websiteApi<WebsiteOrderListItem[]>("/api/v1/admin/orders", {
        params: { status: "PENDING", page_size: 20 },
      })
        .then((r) => { if (alive) setRecentOrders(r); })
        .catch(() => {});
    };
    fetchPending();
    const t = setInterval(fetchPending, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  // Visiting the Orders section marks all current notifications as seen —
  // clears the badge from both the bell and the sidebar item.
  useEffect(() => {
    if (!ready || !pathname.startsWith("/website/orders")) return;
    const nowIso = new Date().toISOString();
    localStorage.setItem("mj_orders_seen_at", nowIso);
    setSeenAt(nowIso);
    setNotifOpen(false);
  }, [pathname, ready]);

  // Close the notification dropdown on outside click / Escape.
  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNotifOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen]);

  // Clock in the header bar (client-only to avoid hydration mismatch).
  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Open the group containing the current page, without closing any others.
  useEffect(() => {
    if (!ready) return;
    for (const g of NAV_GROUPS) {
      if (g.items.some((i) => pathname.startsWith(i.href))) {
        setOpenGroups((prev) => {
          if (prev.has(g.label)) return prev;
          return new Set(prev).add(g.label);
        });
      }
    }
  }, [pathname, ready]);

  if (!ready || !user) {
    return <div className="flex h-screen items-center justify-center text-[#4A5060]">Loading…</div>;
  }

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function doSignOut() {
    clearSession();
    router.replace("/login");
  }

  // Unseen pending website orders, drives both the bell badge and the
  // sidebar indicator on Website → Orders.
  const unseenOrders = recentOrders.filter(
    (o) => !seenAt || new Date(o.created_at) > new Date(seenAt),
  );
  const unseenCount = unseenOrders.length;

  // Find the current page label for the header.
  let currentPage = "Dashboard";
  for (const g of NAV_GROUPS) {
    for (const i of g.items) {
      const match = i.href === "/website" ? pathname === "/website" : pathname.startsWith(i.href);
      if (match) {
        currentPage = i.label;
        break;
      }
    }
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar, navy floating panel; collapses to an icon rail on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#020A38] text-white/85 transition-all lg:relative lg:m-3 lg:rounded-2xl lg:shadow-lg lg:translate-x-0 ${
          collapsed ? "lg:w-[76px]" : "lg:w-64"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Collapse toggle, desktop only, straddles the panel edge */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-14 z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-[#DADDE6] bg-white text-[#4A5060] shadow-sm transition hover:bg-[#FAFAFC] hover:text-[#061161] lg:flex"
        >
          <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-180"}`} />
        </button>

        {/* Brand */}
        <div className={`flex items-center gap-3 border-b border-white/10 px-5 py-4 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
          <img src="/MJ_Logo.jpg" alt="MJ Electricals" className="h-10 w-10 flex-shrink-0 rounded-lg" />
          <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
            <div className="truncate text-sm font-semibold text-white">MJ Electricals</div>
            <div className="truncate text-xs text-white/60">Ghana Limited</div>
          </div>
        </div>

        {/* Nav */}
        <nav
          className={`flex-1 px-3 py-3 ${collapsed ? "lg:overflow-visible" : ""} overflow-y-auto`}
          aria-label="Main navigation"
        >
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((i) => user.permissions.includes(i.permission));
            if (visibleItems.length === 0) return null;
            const isOpen = openGroups.has(group.label);
            const hasActive = visibleItems.some((i) => pathname.startsWith(i.href));
            const GroupIcon = group.Icon;

            return (
              <div key={group.label} className="mb-1">
                {/* Collapsed rail (desktop only): icon button + hover flyout */}
                {collapsed && (
                  <div className="group/rail relative hidden lg:block">
                    <button
                      onClick={() => { setCollapsed(false); setOpenGroups((p) => new Set(p).add(group.label)); }}
                      aria-label={group.label}
                      title={group.label}
                      className={`flex h-11 w-full items-center justify-center rounded-xl transition ${
                        hasActive
                          ? "bg-white text-[#061161]"
                          : "text-white/80 hover:bg-[#0C1448] hover:text-white"
                      }`}
                    >
                      <span className="relative">
                        <GroupIcon className="h-[20px] w-[20px] flex-shrink-0" />
                        {group.label === "Website" && unseenCount > 0 && (
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#C62828] ring-2 ring-[#020A38]" />
                        )}
                      </span>
                    </button>
                    {/* Flyout menu on hover/focus */}
                    <div className="invisible absolute left-full top-1/2 z-50 ml-2 w-52 -translate-y-1/2 rounded-xl bg-[#020A38] p-2 opacity-0 shadow-2xl ring-1 ring-white/10 transition group-hover/rail:visible group-hover/rail:opacity-100 group-focus-within/rail:visible group-focus-within/rail:opacity-100">
                      <div className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                        {group.label}
                      </div>
                      {visibleItems.map((item) => {
                        const active = item.href === "/website"
                          ? pathname === "/website"
                          : pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                              active
                                ? "bg-white font-bold text-[#061161] shadow-sm"
                                : "text-white/85 hover:bg-[#0C1448] hover:text-white"
                            }`}
                          >
                            {item.label}
                            {item.href === "/website/orders" && unseenCount > 0 && (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C62828] px-1 text-[10px] font-bold text-white">
                                {unseenCount > 99 ? "99+" : unseenCount}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expanded group, hidden on desktop when collapsed, always shown on mobile */}
                <div className={collapsed ? "lg:hidden" : ""}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[14px] font-bold transition ${
                    hasActive
                      ? "text-white"
                      : "text-white/80 hover:bg-[#0C1448] hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <GroupIcon className="h-[18px] w-[18px] flex-shrink-0" />
                    {group.label}
                  </span>
                  <IconChevronRight
                    className={`h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                    {visibleItems.map((item) => {
                      const active = item.href === "/website"
                        ? pathname === "/website"
                        : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 text-[14px] font-semibold transition ${
                            active
                              ? "bg-white font-bold text-[#061161] shadow-sm"
                              : "text-white/80 hover:bg-[#0C1448] hover:text-white"
                          }`}
                        >
                          {item.label}
                          {item.href === "/website/orders" && unseenCount > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C62828] px-1 text-[10px] font-bold text-white">
                              {unseenCount > 99 ? "99+" : unseenCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className={`border-t border-white/10 px-5 py-3 ${collapsed ? "lg:px-2" : ""}`}>
          {/* Collapsed rail footer, desktop only */}
          {collapsed && (
            <div className="hidden lg:flex lg:flex-col lg:items-center lg:gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white"
                title={`${user.full_name} · ${user.role_name}`}
              >
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={() => setShowSignOut(true)}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white/85 transition hover:bg-[#0C1448] hover:text-white"
              >
                <IconLogout className="h-4 w-4" />
              </button>
            </div>
          )}
          {/* Expanded footer, hidden on desktop when collapsed, always shown on mobile */}
          <div className={collapsed ? "lg:hidden" : ""}>
            <div className="truncate text-sm font-medium text-white">{user.full_name}</div>
            <div className="truncate text-xs text-white/60">
              {user.role_name}
              {user.branch_name ? ` · ${user.branch_name}` : " · All branches"}
            </div>
            {user.branch_id == null && (
              <Link
                href="/portal"
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-[#0C1448]"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Modules
              </Link>
            )}
            <button
              onClick={() => setShowSignOut(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-[#0C1448]"
            >
              <IconLogout className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header, clean white */}
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[#DADDE6] bg-white px-6 py-3.5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="rounded-xl p-1.5 hover:bg-[#EDEFF9] lg:hidden"
              aria-label="Toggle sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[#0B0E1A]">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <div className="text-[17px] font-extrabold tracking-tight text-[#0B0E1A]">{currentPage}</div>
          </div>
          <div className="flex items-center gap-4">
            {mounted && (
              <div className="hidden text-xs text-[#4A5060] sm:block">
                {now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{" "}
                {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </div>
            )}
            {/* Website order notifications, dropdown, website admins only */}
            {user.permissions.includes("website.manage") && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="relative rounded-xl p-2 text-[#4A5060] hover:bg-[#EDEFF9] hover:text-[#0B0E1A]"
                  title="Notifications"
                  aria-label={`${unseenCount} new website orders`}
                  aria-expanded={notifOpen}
                  aria-haspopup="true"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unseenCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C62828] px-1 text-[10px] font-bold text-white">
                      {unseenCount > 99 ? "99+" : unseenCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[#DADDE6] bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-[#DADDE6] px-4 py-2.5">
                      <span className="text-sm font-semibold text-[#0B0E1A]">Notifications</span>
                      {unseenCount > 0 && (
                        <span className="rounded-full bg-[#C62828]/10 px-2 py-0.5 text-[11px] font-semibold text-[#C62828]">
                          {unseenCount} new
                        </span>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {recentOrders.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-[#6B7183]">
                          No pending website orders
                        </p>
                      ) : (
                        recentOrders.slice(0, 8).map((o) => {
                          const isNew = !seenAt || new Date(o.created_at) > new Date(seenAt);
                          return (
                            <Link
                              key={o.id}
                              href="/website/orders"
                              onClick={() => setNotifOpen(false)}
                              className="flex items-center justify-between gap-3 border-b border-[#DADDE6] px-4 py-3 transition last:border-0 hover:bg-[#FAFAFC]"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-[#0B0E1A]">
                                    {o.order_number}
                                  </span>
                                  {isNew && (
                                    <span className="rounded-full bg-[#C62828]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#C62828]">
                                      NEW
                                    </span>
                                  )}
                                </div>
                                <div className="truncate text-xs text-[#4A5060]">
                                  {o.guest_name ?? "Guest"} · {o.items_count} item{o.items_count === 1 ? "" : "s"} · ₵{o.total}
                                </div>
                              </div>
                              <span className="flex-shrink-0 text-[11px] text-[#6B7183]">
                                {new Date(o.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                              </span>
                            </Link>
                          );
                        })
                      )}
                    </div>
                    {recentOrders.length > 0 && (
                      <Link
                        href="/website/orders"
                        onClick={() => setNotifOpen(false)}
                        className="block border-t border-[#DADDE6] px-4 py-2.5 text-center text-xs font-semibold text-[#061161] hover:bg-[#EDEFF9]"
                      >
                        View all orders
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-semibold leading-tight text-[#0B0E1A]">{user.full_name}</div>
                <div className="text-[11px] leading-tight text-[#4A5060]">{user.role_name}</div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EDEFF9] text-sm font-semibold text-[#061161]">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <OfflineBanner />
        <main className="flex-1 overflow-auto bg-[#F4F5F9]"><LiveBoundary>{children}</LiveBoundary></main>
      </div>

      {showSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#DADDE6] bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-[#0B0E1A]">Sign out?</h2>
            <p className="mb-5 text-sm text-[#4A5060]">
              You will be returned to the login screen. Any unsaved changes will be lost.
            </p>
            <div className="flex gap-2">
              <button
                onClick={doSignOut}
                className="flex-1 rounded-xl bg-[#061161] py-2 text-sm font-medium text-white hover:bg-[#0A1C8C]"
              >
                Yes, sign out
              </button>
              <button
                onClick={() => setShowSignOut(false)}
                className="flex-1 rounded-xl border border-[#DADDE6] py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
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
