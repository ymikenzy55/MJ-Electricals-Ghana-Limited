"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getStoredUser } from "@/lib/api";
import type { Shift } from "@/lib/types";
import { PageHeader } from "@/components/ui";

const cedi = (v: string | number | null) => {
  if (v === null || v === undefined) return "-";
  const n = typeof v === "string" ? parseFloat(v) || 0 : v;
  return `\u20b5 ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function ShiftsPage() {
  return <ShiftsScreen />;
}

function ShiftsScreen() {
  const user = getStoredUser();
  const canViewAll = user?.permissions.includes("shifts.view_all") ?? false;

  const [current, setCurrent] = useState<Shift | null>(null);
  const [history, setHistory] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [openFloat, setOpenFloat] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [cur, hist] = await Promise.allSettled([
      api<Shift | null>("/api/v1/shifts/current"),
      api<Shift[]>("/api/v1/shifts", { params: { page: 1, page_size: 25 } }),
    ]);
    if (cur.status === "fulfilled") setCurrent(cur.value);
    else setCurrent(null);
    if (hist.status === "fulfilled") setHistory(hist.value);
    else {
      setHistory([]);
      if (hist.reason instanceof ApiError) setError(hist.reason.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openShift() {
    if (user?.branch_id === null && !user?.permissions.includes("shifts.operate")) return;
    setBusy(true);
    setError(null);
    try {
      await api<Shift>("/api/v1/shifts/open", {
        method: "POST",
        body: {
          branch_id: user?.branch_id,
          opening_float: (parseFloat(openFloat) || 0).toFixed(2),
          notes: openNotes.trim() || null,
        },
      });
      setOpenFloat("");
      setOpenNotes("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the shift");
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api<Shift>(`/api/v1/shifts/${current.id}/close`, {
        method: "POST",
        body: {
          counted_cash: (parseFloat(countedCash) || 0).toFixed(2),
          notes: closeNotes.trim() || null,
        },
      });
      setShowClose(false);
      setCountedCash("");
      setCloseNotes("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not close the shift");
    } finally {
      setBusy(false);
    }
  }

  const expectedNow = current
    ? (parseFloat(current.opening_float) || 0) + (parseFloat(current.cash_taken) || 0) - (parseFloat(current.cash_expenses ?? "0") || 0)
    : 0;
  const countedNum = parseFloat(countedCash) || 0;
  const varianceNow = countedNum - expectedNow;

  if (user?.branch_id === null) {
    return (
      <div className="min-h-full bg-[#EDEFF9]">
        <Header />
        <div className="p-6">
          <div className="rounded-xl border border-[#DADDE6] bg-white p-6">
            <h2 className="mb-1 text-base font-semibold text-[#0B0E1A]">
              Shifts are per branch
            </h2>
            <p className="text-sm text-[#4A5060]">
              Your account is not tied to a branch, so you cannot open a drawer yourself.
              Shift history for all branches is listed below.
            </p>
          </div>
          <div className="mt-6">
            <HistoryTable shifts={history} loading={loading} showUser={canViewAll} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#EDEFF9]">
      <Header />
      <div className="p-6">
        {error && (
          <div className="mb-5 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-4 py-2.5 text-sm text-[#C62828]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mb-6 h-44 animate-pulse rounded-xl bg-white" />
        ) : current ? (
          <section className="mb-6 rounded-xl border border-[#DADDE6] bg-white">
            <div className="flex items-center justify-between border-b-2 border-[#16803C] px-5 py-3">
              <h2 className="text-sm font-semibold text-[#0B0E1A]">Open shift</h2>
              <span className="rounded-full bg-[#16803C]/15 px-2.5 py-1 text-xs font-semibold text-[#16803C]">
                OPEN
              </span>
            </div>
            <div className="grid grid-cols-2 gap-5 p-5 lg:grid-cols-5">
              <Stat label="Opened at" value={new Date(current.opened_at).toLocaleString()} />
              <Stat label="Opening float" value={cedi(current.opening_float)} />
              <Stat label="Sales" value={String(current.sales_count)} />
              <Stat label="Sales value" value={cedi(current.sales_total)} />
              <Stat label="Cash taken" value={cedi(current.cash_taken)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DADDE6] bg-[#FAFAFC] px-5 py-4">
              <div className="text-sm">
                <span className="text-[#4A5060]">Expected in drawer: </span>
                <span className="font-bold text-[#0B0E1A]">{cedi(expectedNow)}</span>
                <span className="ml-2 text-xs text-[#6B7183]">
                  (float + cash sales)
                </span>
              </div>
              <button
                onClick={() => setShowClose(true)}
                className="rounded-full bg-[#C62828] px-5 py-2 text-sm font-semibold text-white hover:bg-[#A32020]"
              >
                Close shift &amp; count cash
              </button>
            </div>
          </section>
        ) : (
          <section className="mb-6 rounded-xl border border-[#DADDE6] bg-white">
            <div className="border-b-2 border-[#061161] px-5 py-3">
              <h2 className="text-sm font-semibold text-[#0B0E1A]">Open a new shift</h2>
            </div>
            <div className="p-5">
              <p className="mb-4 text-sm text-[#4A5060]">
                Count the cash you are starting with and enter it as your opening float.
                Every cash sale you take will be added to it.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="float"
                    className="mb-1 block text-xs font-semibold uppercase text-[#4A5060]"
                  >
                    Opening float
                  </label>
                  <input
                    id="float"
                    type="number"
                    min={0}
                    step="0.01"
                    value={openFloat}
                    onChange={(e) => setOpenFloat(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="onotes"
                    className="mb-1 block text-xs font-semibold uppercase text-[#4A5060]"
                  >
                    Notes (optional)
                  </label>
                  <input
                    id="onotes"
                    value={openNotes}
                    onChange={(e) => setOpenNotes(e.target.value)}
                    placeholder="e.g. morning shift, till 2"
                    className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={openShift}
                disabled={busy}
                className="mt-4 rounded-full bg-[#061161] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50"
              >
                {busy ? "Opening..." : "Open shift"}
              </button>
            </div>
          </section>
        )}

        <HistoryTable shifts={history} loading={loading} showUser={canViewAll} />
      </div>

      {/* Close shift modal */}
      {showClose && current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Close shift"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-[#0B0E1A]">Close shift</h2>
            <p className="mb-5 text-sm text-[#4A5060]">
              Count the physical cash in the drawer and enter the total.
            </p>

            <dl className="mb-4 space-y-1.5 rounded border border-[#DADDE6] bg-[#FAFAFC] px-4 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Opening float</dt>
                <dd className="text-[#0B0E1A]">{cedi(current.opening_float)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#4A5060]">Cash sales</dt>
                <dd className="text-[#0B0E1A]">{cedi(current.cash_taken)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#DADDE6] pt-1.5 font-semibold">
                <dt className="text-[#0B0E1A]">Expected</dt>
                <dd className="text-[#0B0E1A]">{cedi(expectedNow)}</dd>
              </div>
            </dl>

            <label
              htmlFor="counted"
              className="mb-1 block text-xs font-semibold uppercase text-[#4A5060]"
            >
              Counted cash
            </label>
            <input
              id="counted"
              type="number"
              min={0}
              step="0.01"
              autoFocus
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              placeholder="0.00"
              className="mb-2 w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
            />

            {countedCash !== "" && (
              <div
                className={`mb-3 rounded-full px-3 py-2 text-sm font-medium ${
                  Math.abs(varianceNow) < 0.005
                    ? "bg-[#16803C]/10 text-[#16803C]"
                    : varianceNow > 0
                      ? "bg-[#EDEFF9] text-[#061161]"
                      : "bg-[#C62828]/10 text-[#C62828]"
                }`}
              >
                {Math.abs(varianceNow) < 0.005
                  ? "Drawer balances exactly"
                  : varianceNow > 0
                    ? `Over by ${cedi(varianceNow)}`
                    : `Short by ${cedi(-varianceNow)}`}
              </div>
            )}

            <label
              htmlFor="cnotes"
              className="mb-1 block text-xs font-semibold uppercase text-[#4A5060]"
            >
              Notes (optional)
            </label>
            <input
              id="cnotes"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Explain any variance"
              className="mb-5 w-full rounded border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
            />

            <div className="flex gap-2">
              <button
                onClick={closeShift}
                disabled={busy || countedCash === ""}
                className="flex-1 rounded-full bg-[#C62828] py-2 text-sm font-semibold text-white hover:bg-[#A32020] disabled:opacity-50"
              >
                {busy ? "Closing..." : "Confirm close"}
              </button>
              <button
                onClick={() => setShowClose(false)}
                className="flex-1 rounded border border-[#DADDE6] py-2 text-sm font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
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

function Header() {
  return (
    <PageHeader
      title="Cash Drawer & Shifts"
      breadcrumb="Cash Drawer & Shifts"
      subtitle="Open a drawer, take sales, then count and close to record any variance"
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-[#6B7183]">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-[#0B0E1A]">{value}</div>
    </div>
  );
}

function HistoryTable({
  shifts,
  loading,
  showUser,
}: {
  shifts: Shift[];
  loading: boolean;
  showUser: boolean;
}) {
  return (
    <section className="rounded-xl border border-[#DADDE6] bg-white">
      <div className="border-b-2 border-[#16803C] px-5 py-3">
        <h2 className="text-sm font-semibold text-[#0B0E1A]">Shift history</h2>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-full bg-[#EDEFF9]" />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#6B7183]">No shifts recorded yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
              <tr>
                <th scope="col" className="px-5 py-2.5">Opened</th>
                <th scope="col" className="px-5 py-2.5">Closed</th>
                {showUser && <th scope="col" className="px-5 py-2.5">Cashier</th>}
                <th scope="col" className="px-5 py-2.5">Status</th>
                <th scope="col" className="px-5 py-2.5 text-right">Float</th>
                <th scope="col" className="px-5 py-2.5 text-right">Sales</th>
                <th scope="col" className="px-5 py-2.5 text-right">Expected</th>
                <th scope="col" className="px-5 py-2.5 text-right">Counted</th>
                <th scope="col" className="px-5 py-2.5 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => {
                const v = s.variance === null ? null : parseFloat(s.variance);
                return (
                  <tr key={s.id} className="border-t border-[#DADDE6]">
                    <td className="whitespace-nowrap px-5 py-2.5 text-[#4A5060]">
                      {new Date(s.opened_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-[#4A5060]">
                      {s.closed_at ? new Date(s.closed_at).toLocaleString() : "-"}
                    </td>
                    {showUser && (
                      <td className="px-5 py-2.5 text-[#4A5060]">{s.user_name ?? "-"}</td>
                    )}
                    <td className="px-5 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          s.status === "OPEN"
                            ? "bg-[#16803C]/15 text-[#16803C]"
                            : "bg-[#EDEFF9] text-[#4A5060]"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-[#4A5060]">
                      {cedi(s.opening_float)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[#4A5060]">
                      {cedi(s.sales_total)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[#4A5060]">
                      {cedi(s.expected_cash)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[#4A5060]">
                      {cedi(s.counted_cash)}
                    </td>
                    <td
                      className={`px-5 py-2.5 text-right font-semibold ${
                        v === null
                          ? "text-[#6B7183]"
                          : Math.abs(v) < 0.005
                            ? "text-[#16803C]"
                            : v > 0
                              ? "text-[#061161]"
                              : "text-[#C62828]"
                      }`}
                    >
                      {v === null ? "-" : cedi(v)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
