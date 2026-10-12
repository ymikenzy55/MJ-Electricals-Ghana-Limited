"use client";

import type { ReactNode } from "react";

/** Page title bar: breadcrumb, title, one line of help text and the page's main actions. */
export function PageHeader({ title, breadcrumb, subtitle, actions }: {
  title: string; breadcrumb?: string; subtitle?: string; actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">{breadcrumb}</p>}
        <h1 className="text-[26px] font-extrabold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = "default", icon }: {
  label: string; value: string | number; sub?: string;
  tone?: "default" | "success" | "warning" | "error" | "info";
  icon?: ReactNode;
}) {
  const text = { default: "text-ink", success: "text-success", warning: "text-warning", error: "text-error", info: "text-info" }[tone];
  const chip = { default: "bg-primary-soft text-primary", success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", error: "bg-error/10 text-error", info: "bg-info/10 text-info" }[tone];
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-white p-5 shadow-[0_1px_2px_rgba(11,14,26,0.04)]">
      <div className="min-w-0">
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">{label}</p>
        <p className={`mt-2 text-[28px] font-extrabold tabular-nums leading-none ${text}`}>{value}</p>
        {sub && <p className="mt-2 text-xs text-faint">{sub}</p>}
      </div>
      {icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${chip}`}>{icon}</span>}
    </div>
  );
}

export function Card({ title, children, action, flush }: { title?: string; children: ReactNode; action?: ReactNode; flush?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-[0_1px_2px_rgba(11,14,26,0.04)]">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </div>
  );
}

const STATUS: Record<string, string> = {
  PRESENT: "bg-success/10 text-success",
  LATE: "bg-warning/10 text-warning",
  ABSENT: "bg-error/10 text-error",
  LEAVE: "bg-info/10 text-info",
  HALF_DAY: "bg-info/10 text-info",
  ACTIVE: "bg-success/10 text-success",
  SUSPENDED: "bg-warning/10 text-warning",
  TERMINATED: "bg-error/10 text-error",
  DRAFT: "bg-surface text-muted",
  APPROVED: "bg-info/10 text-info",
  PAID: "bg-success/10 text-success",
  PENDING: "bg-warning/10 text-warning",
  REJECTED: "bg-error/10 text-error",
  CANCELLED: "bg-surface text-muted",
  CLEARED: "bg-success/10 text-success",
  HOLIDAY: "bg-info/10 text-info",
  REST_DAY: "bg-surface text-faint",
  UPCOMING: "bg-surface text-faint",
  OK: "bg-success/10 text-success",
  TOO_FAR: "bg-error/10 text-error",
  BAD_CODE: "bg-error/10 text-error",
  NO_LOCATION: "bg-warning/10 text-warning",
  DUPLICATE: "bg-surface text-muted",
  TOO_SOON: "bg-surface text-muted",
  CHECK_IN: "bg-success/10 text-success",
  CHECK_OUT: "bg-info/10 text-info",
};

export function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-md px-2.5 py-0.5 text-[11px] font-bold ${STATUS[status] || "bg-surface text-muted"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-faint">
      <svg className="h-5 w-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
      </svg>
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center">
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

export const inputCls = "h-10 w-full rounded-lg border-[1.5px] border-border bg-white px-3.5 text-sm text-ink outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15";

export function Button({ children, variant = "primary", className = "", ...props }: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-hover shadow-sm",
    secondary: "border-[1.5px] border-primary bg-white text-primary hover:bg-primary-soft",
    danger: "bg-error text-white hover:bg-error/90",
    ghost: "text-muted hover:bg-primary-soft hover:text-primary",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-3xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-ink" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
