"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/attendance/today", label: "Today" },
  { href: "/attendance/monthly", label: "Monthly report" },
  { href: "/attendance/qr", label: "Wall QR code" },
  { href: "/attendance/scans", label: "Scan log" },
  { href: "/attendance", label: "Records" },
];

export default function AttendanceTabs() {
  const path = usePathname();
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
      {TABS.map((t) => {
        const active = t.href === "/attendance" ? path === "/attendance" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${active ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
