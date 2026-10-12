"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, cedi, fmtTime, type DailyBoard, type DashboardStats } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Card, PageHeader, Spinner, StatCard } from "@/components/ui";

const ic = (d: string) => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const ICONS = {
  people: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  check: "M5 13l4 4L19 7",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  x: "M6 18L18 6M6 6l12 12",
  cal: "M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
};

function Attention({ href, count, title, hint, tone }: { href: string; count: number; title: string; hint: string; tone: "warning" | "error" | "info" }) {
  const c = { warning: "bg-warning/10 text-warning", error: "bg-error/10 text-error", info: "bg-info/10 text-info" }[tone];
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition hover:border-primary hover:bg-primary-soft">
      <span className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-extrabold ${c}`}>{count}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <svg className="h-4 w-4 text-faint" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
    </Link>
  );
}

export default function DashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [signups, setSignups] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    Promise.all([api.dashboard(token), api.daily(token), api.employees(token, { status: "PENDING" })])
      .then(([s, d, p]) => { setStats(s); setBoard(d); setSignups(p.length); setError(null); })
      .catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  if (!token) return <Spinner />;
  if (error && !stats) return <div className="p-6"><p className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</p></div>;
  if (!stats || !board) return <Spinner label="Loading dashboard…" />;

  const present = (board.summary.PRESENT ?? 0) + (board.summary.LATE ?? 0);
  const expected = board.is_working_day ? board.total - (board.summary.LEAVE ?? 0) : 0;
  const rate = expected > 0 ? Math.round((present / expected) * 100) : 0;
  const absent = board.rows.filter((r) => r.status === "ABSENT");
  const flagged = board.rows.filter((r) => r.flagged).length;
  const pendingLeave = stats.pending_leave ?? 0;
  const hasAttention = signups + pendingLeave + stats.pending_runs + flagged > 0;
  const arrived = board.rows.filter((r) => r.check_in).sort((a, b) => (b.check_in ?? "").localeCompare(a.check_in ?? ""));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Dashboard"
        breadcrumb="Payroll & Attendance"
        subtitle={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={<>
          <Link href="/attendance/qr" className="inline-flex items-center rounded-lg border-[1.5px] border-primary bg-white px-4 py-2.5 text-[13px] font-bold text-primary hover:bg-primary-soft">Wall QR code</Link>
          <Link href="/payroll" className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-primary-hover">Run payroll</Link>
        </>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Present today" value={`${present} / ${expected || stats.active_employees}`} tone="success" sub={board.is_working_day ? `${rate}% attendance` : (board.holiday ?? "Not a working day")} icon={ic(ICONS.check)} />
        <StatCard label="Late arrivals" value={stats.late_today} tone="warning" sub="Reported after start time" icon={ic(ICONS.clock)} />
        <StatCard label="Absent" value={absent.length} tone={absent.length ? "error" : "default"} sub="No scan yet today" icon={ic(ICONS.x)} />
        <StatCard label="On leave" value={stats.on_leave_today ?? 0} tone="info" sub={`${stats.active_employees} active staff`} icon={ic(ICONS.cal)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title="Who is in today" flush action={<Link href="/attendance/today" className="text-xs font-bold text-primary hover:underline">Open full board</Link>}>
            {arrived.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">No one has scanned in yet today.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="text-left"><th className="px-5 py-2.5">Worker</th><th className="px-3 py-2.5">In</th><th className="px-3 py-2.5">Out</th><th className="px-5 py-2.5">Status</th></tr></thead>
                  <tbody>
                    {arrived.slice(0, 8).map((r) => (
                      <tr key={r.employee_id}>
                        <td className="px-5 py-3"><p className="font-semibold text-ink">{r.employee_name}</p><p className="text-xs text-faint">{r.employee_code}{r.department ? ` · ${r.department}` : ""}</p></td>
                        <td className="px-3 py-3 tabular-nums text-muted">{fmtTime(r.check_in)}</td>
                        <td className="px-3 py-3 tabular-nums text-muted">{fmtTime(r.check_out)}</td>
                        <td className="px-5 py-3"><Badge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {board.is_working_day && absent.length > 0 && (
            <Card title={`Not in yet (${absent.length})`} action={<Link href="/attendance/today" className="text-xs font-bold text-primary hover:underline">See all</Link>}>
              <div className="flex flex-wrap gap-2">
                {absent.slice(0, 18).map((a) => (
                  <span key={a.employee_id} className="rounded-full border border-error/20 bg-error/5 px-3 py-1 text-xs font-semibold text-error">{a.employee_name}</span>
                ))}
                {absent.length > 18 && <span className="px-2 py-1 text-xs text-muted">and {absent.length - 18} more</span>}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Needs your attention">
            {hasAttention ? (
              <div className="space-y-2">
                {signups > 0 && <Attention href="/employees" count={signups} title="New sign ups" hint="Approve or decline workers" tone="warning" />}
                {pendingLeave > 0 && <Attention href="/leave" count={pendingLeave} title="Leave requests" hint="Waiting for a decision" tone="warning" />}
                {flagged > 0 && <Attention href="/attendance/today" count={flagged} title="Scans to check" hint="Offline or shared phone scans" tone="error" />}
                {stats.pending_runs > 0 && <Attention href="/payroll" count={stats.pending_runs} title="Payroll runs" hint="Draft or approved, not yet paid" tone="info" />}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted">All clear. Nothing is waiting for you.</p>
            )}
          </Card>

          <Card title="Payroll snapshot">
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between"><dt className="text-muted">Last run total</dt><dd className="text-lg font-extrabold tabular-nums text-ink">{cedi(stats.last_run_total)}</dd></div>
              <div className="flex items-baseline justify-between"><dt className="text-muted">Net pay this year</dt><dd className="font-bold tabular-nums text-ink">{cedi(stats.payroll_ytd ?? 0)}</dd></div>
              <div className="flex items-baseline justify-between"><dt className="text-muted">Active staff loans</dt><dd className="font-bold text-ink">{stats.active_loans ?? 0}</dd></div>
              <div className="flex items-baseline justify-between"><dt className="text-muted">Departments</dt><dd className="font-bold text-ink">{stats.departments}</dd></div>
            </dl>
          </Card>

          <Card title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              {[["/employees", "Add employee"], ["/attendance/monthly", "Monthly report"], ["/payments", "Payment log"], ["/reports", "Reports"]].map(([href, label]) => (
                <Link key={href} href={href} className="rounded-lg border border-border px-3 py-2.5 text-center text-[13px] font-bold text-ink hover:border-primary hover:bg-primary-soft">{label}</Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
