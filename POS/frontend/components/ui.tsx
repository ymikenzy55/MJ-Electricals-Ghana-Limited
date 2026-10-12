"use client";

/**
 * Reusable design-system components for the MJ Electricals POS.
 *
 * Central design tokens (UI kit):
 *   Primary:   #061161  (deep navy - actions, active nav, links)
 *   Accent:    #780206  (deep red - gradient button outlines)
 *   Sidebar:   #061161  (deep navy - navigation background)
 *   Background:#FFFFFF  (white - main workspace)
 *   Surface:   #FAFAFC  (subtle - table headers, hovers)
 *   Border:    #DADDE6  (neutral gray - subtle borders)
 *   Text:      #0B0E1A / #4A5060 / #6B7183
 *   Status:    #16803C / #B7791F / #C62828 / #2563EB
 */

import Link from "next/link";
import type { ReactNode } from "react";

export const BRAND = "#061161";
export const BRAND_DARK = "#0A1C8C";

export const cedi = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) || 0 : v;
  return `\u20b5 ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/* ------------------------------ PageHeader ------------------------------ */

export function PageHeader({
  title,
  breadcrumb,
  actions,
  subtitle,
}: {
  title: string;
  breadcrumb?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DADDE6] bg-white px-6 py-5">
      <div className="min-w-0">
        {breadcrumb && (
          <div className="mb-0.5 text-xs text-[#4A5060]">
            <Link href="/dashboard" className="hover:text-[#061161]">Home</Link>
            {" / "}
            <span className="text-[#4A5060]">{breadcrumb}</span>
          </div>
        )}
        <h1 className="text-[26px] font-extrabold tracking-tight leading-tight text-[#0B0E1A]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-[#4A5060]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------- StatCard ------------------------------- */

export function StatCard({
  label,
  value,
  icon,
  loading,
  hint,
  trend,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  loading?: boolean;
  hint?: string;
  /** Optional movement indicator, e.g. { value: "12.5%", direction: "up" } */
  trend?: { value: string; direction: "up" | "down" | "flat" };
}) {
  const trendCls =
    trend?.direction === "up"
      ? "text-[#16803C]"
      : trend?.direction === "down"
        ? "text-[#C62828]"
        : "text-[#6B7183]";
  const arrow = trend?.direction === "up" ? "\u2191" : trend?.direction === "down" ? "\u2193" : "\u2014";
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#DADDE6] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(11,14,26,0.04)]">
      <div className="min-w-0">
        <div className="text-[12px] font-bold uppercase tracking-wide text-[#4A5060]">{label}</div>
        {loading ? (
          <div className="mt-2 h-7 w-20 animate-pulse rounded-full bg-[#EDEFF9]" />
        ) : (
          <div className="mt-1 truncate text-[28px] font-extrabold leading-8 tabular-nums text-[#0B0E1A]">
            {value}
          </div>
        )}
        {(trend || hint) && (
          <div className="mt-1 flex items-baseline gap-1.5 truncate text-xs text-[#4A5060]">
            {trend && <span className={`font-semibold ${trendCls}`}>{arrow} {trend.value}</span>}
            {hint && <span className="truncate">{hint}</span>}
          </div>
        )}
      </div>
      {icon && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#EDEFF9] text-[#061161]">
          {icon}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- SectionCard ------------------------------ */

export function SectionCard({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`rounded-xl border border-[#DADDE6] bg-white shadow-[0_1px_2px_rgba(11,14,26,0.04)] ${className}`}>
      <div className="flex items-center justify-between border-b border-[#DADDE6] px-5 py-3">
        <h2 className="text-[16px] font-bold text-[#0B0E1A]">{title}</h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/* ----------------------------- EmptyState ------------------------------- */

export function EmptyState({ message }: { message: string }) {
  return <p className="p-8 text-center text-sm text-[#4A5060]">{message}</p>;
}

/* -------------------------------- Badge -------------------------------- */

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "orange" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "bg-[#EDEFF9] text-[#0B0E1A]",
    green: "bg-[#16803C]/15 text-[#16803C]",
    amber: "bg-[#B7791F]/15 text-[#B7791F]",
    red: "bg-[#C62828]/15 text-[#C62828]",
    orange: "bg-[#EDEFF9] text-[#061161]",
    blue: "bg-[#2563EB]/15 text-[#2563EB]",
  };
  return (
    <span className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ------------------------------- Button -------------------------------- */

export function Button({
  children,
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, string> = {
    primary: "bg-[#061161] text-white hover:bg-[#0A1C8C]",
    secondary: "btn-outline font-semibold",
    danger: "bg-[#C62828] text-white hover:bg-[#A32020]",
    ghost: "bg-transparent text-[#061161] hover:bg-[#EDEFF9]",
  };
  return (
    <button
      {...props}
      className={`rounded-lg px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- Field --------------------------------- */

export function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-[#4A5060]">
        {label}
        {required && <span className="text-[#C62828]"> *</span>}
      </span>
      {children}
    </label>
  );
}

/* ----------------------------- Pagination ------------------------------ */

export function Pagination({
  page,
  pages,
  onPage,
  onPrev,
  onNext,
  className = "",
}: {
  page: number;
  pages: number;
  /** Jump directly to a page; if omitted only Previous/Next render. */
  onPage?: (p: number) => void;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
}) {
  const go = (p: number) => onPage?.(p);
  const prev = onPrev ?? (onPage ? () => onPage(Math.max(1, page - 1)) : undefined);
  const next = onNext ?? (onPage ? () => onPage(Math.min(pages, page + 1)) : undefined);

  // Windowed page numbers: always show first/last, keep it compact.
  const nums: (number | "…")[] = [];
  const win = new Set<number>([1, pages, page - 1, page, page + 1]);
  for (let p = 1; p <= pages; p++) if (win.has(p)) nums.push(p);
  for (let i = 1; i < nums.length; i++) {
    const a = nums[i - 1] as number;
    const b = nums[i] as number;
    if (b - a > 1) nums.splice(i, 0, "…"), i++;
  }

  const btn =
    "min-w-9 border border-[#DADDE6] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0B0E1A] transition hover:bg-[#FAFAFC] disabled:opacity-40";

  return (
    <nav className={`mt-3 flex items-center gap-1.5 text-sm text-[#4A5060] ${className}`} aria-label="Pagination">
      <button onClick={prev} disabled={page <= 1} className={btn}>
        Previous
      </button>
      {onPage &&
        nums.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1 text-[#6B7183]">…</span>
          ) : (
            <button
              key={n}
              onClick={() => go(n)}
              aria-current={n === page ? "page" : undefined}
              className={
                n === page
                  ? "min-w-9 bg-[#061161] px-3 py-1.5 text-[13px] font-semibold text-white"
                  : btn
              }
            >
              {n}
            </button>
          ),
        )}
      {!onPage && <span className="px-2">Page {page} of {pages}</span>}
      <button onClick={next} disabled={page >= pages} className={btn}>
        Next
      </button>
    </nav>
  );
}

/* ----------------------------- AlertRow ------------------------------- */

export function Alert({
  tone = "red",
  children,
}: {
  tone?: "red" | "green" | "amber";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    red: "border-[#C62828]/30 bg-[#C62828]/10 text-[#C62828]",
    green: "border-[#16803C]/30 bg-[#16803C]/10 text-[#16803C]",
    amber: "border-[#B7791F]/30 bg-[#B7791F]/10 text-[#B7791F]",
  };
  return (
    <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>
  );
}

/* ----------------------------- TableShell ----------------------------- */

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#DADDE6] bg-white">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`border-b-2 border-[#DADDE6] bg-[#F4F5F9] px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-[#4A5060] ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`border-t border-[#E8EAF0] px-4 py-3.5 text-[14px] text-[#0B0E1A] ${className}`}>
      {children}
    </td>
  );
}
