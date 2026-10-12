"use client";

/**
 * Dependency-free SVG charts.
 *
 * Deliberately not using a charting library: these render in a single pass,
 * add nothing to the JS bundle, and keep the dashboard inside its load budget.
 */

import { useMemo, useState } from "react";

const cedi = (n: number) =>
  `\u20b5 ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function niceCeil(v: number): number {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function shortMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/* ----------------------------- Area line chart ---------------------------- */

export interface SeriesPoint {
  label: string;
  value: number;
}

export function AreaChart({
  points,
  height = 240,
  color = "#061161",
  emptyMessage = "No data for this period",
}: {
  points: SeriesPoint[];
  height?: number;
  color?: string;
  emptyMessage?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = height;
  const padL = 52;
  const padR = 12;
  const padT = 12;
  const padB = 34;

  const { max, path, area, xs, ys, ticks } = useMemo(() => {
    const values = points.map((p) => p.value);
    const rawMax = Math.max(0, ...values);
    const max = niceCeil(rawMax);
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const n = points.length;
    const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
    const y = (v: number) => padT + innerH - (max === 0 ? 0 : (v / max) * innerH);

    const xs = points.map((_, i) => x(i));
    const ys = points.map((p) => y(p.value));
    const path = xs.map((px, i) => `${i === 0 ? "M" : "L"}${px},${ys[i]}`).join(" ");
    const area =
      n > 0
        ? `${path} L${xs[n - 1]},${padT + innerH} L${xs[0]},${padT + innerH} Z`
        : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      v: max * f,
      y: padT + innerH - f * innerH,
    }));
    return { max, path, area, xs, ys, ticks };
  }, [points, H]);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[#4A5060]"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const allZero = points.every((p) => p.value === 0);

  // Show at most ~8 x labels so they never collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Sales trend chart"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* horizontal grid + y labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={t.y}
              y2={t.y}
              stroke="#DADDE6"
              strokeWidth="1"
            />
            <text x={padL - 8} y={t.y + 4} textAnchor="end" className="fill-[#6B7183]" fontSize="11" fontWeight="500">
              {shortMoney(t.v)}
            </text>
          </g>
        ))}

        {!allZero && (
          <>
            <path d={area} fill="url(#areaFill)" />
            <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
          </>
        )}

        {/* hover targets + points */}
        {points.map((p, i) => (
          <g key={p.label}>
            <rect
              x={xs[i] - 10}
              y={padT}
              width={20}
              height={H - padT - padB}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            {(hover === i || (!allZero && points.length <= 31)) && (
              <circle
                cx={xs[i]}
                cy={ys[i]}
                r={hover === i ? 4.5 : 2.5}
                fill="#fff"
                stroke={color}
                strokeWidth="2"
              />
            )}
          </g>
        ))}

        {/* hover guide line */}
        {hover !== null && (
          <line
            x1={xs[hover]}
            x2={xs[hover]}
            y1={padT}
            y2={H - padB}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* x labels */}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={`l-${p.label}`}
              x={xs[i]}
              y={H - padB + 18}
              textAnchor="middle"
              className="fill-[#6B7183]"
              fontSize="10.5"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-xl border border-[#DADDE6] bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${(xs[hover] / W) * 100}%`, top: 4 }}
        >
          <div className="font-medium text-[#4A5060]">{points[hover].label}</div>
          <div className="font-semibold tabular-nums text-[#0B0E1A]">{cedi(points[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Bar chart -------------------------------- */

export function HBarChart({
  items,
  emptyMessage = "No sales in this period",
}: {
  items: { label: string; value: number; sub?: string }[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <div className="py-10 text-center text-sm text-[#4A5060]">{emptyMessage}</div>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-3">
      {items.map((it, idx) => (
        <li key={it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm text-[#0B0E1A]">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#EDEFF9] text-[11px] font-semibold text-[#4A5060]">
                {idx + 1}
              </span>
              <span className="truncate">{it.label}</span>
            </span>
            <span className="flex-shrink-0 text-sm font-semibold text-[#0B0E1A]">
              {cedi(it.value)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EDEFF9]">
              <div
                className="h-full rounded-full bg-[#061161]"
                style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
              />
            </div>
            {it.sub && <span className="w-20 text-right text-xs text-[#4A5060]">{it.sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ Donut chart ------------------------------- */

const DONUT_COLORS = ["#061161", "#16803C", "#B7791F", "#2563EB", "#C62828", "#6B7183"];

export function DonutChart({
  items,
  size = 160,
  emptyMessage = "No payments recorded",
}: {
  items: { label: string; value: number }[];
  size?: number;
  emptyMessage?: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (items.length === 0 || total <= 0) {
    return <div className="py-10 text-center text-sm text-[#4A5060]">{emptyMessage}</div>;
  }

  const r = 56;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Payment mix">
        <g transform="rotate(-90 70 70)">
          {items.map((it, i) => {
            const frac = it.value / total;
            const dash = frac * c;
            const seg = (
              <circle
                key={it.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth="18"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
        <text x="70" y="62" textAnchor="middle" className="fill-[#6B7183]" fontSize="11">
          Total
        </text>
        <text
          x="70"
          y="84"
          textAnchor="middle"
          className="fill-[#0B0E1A]"
          fontSize="19"
          fontWeight="700"
        >
          {shortMoney(total)}
        </text>
      </svg>

      <ul className="space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="text-[#4A5060]">{it.label}</span>
            <span className="ml-auto pl-3 font-medium text-[#0B0E1A]">
              {((it.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
