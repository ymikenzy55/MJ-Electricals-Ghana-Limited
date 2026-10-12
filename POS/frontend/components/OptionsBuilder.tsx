"use client";

import { useEffect, useMemo, useState } from "react";

export interface OptionGroup { name: string; values: string[] }
export interface OptionRow {
  key: string;
  attrs: Record<string, string>;
  label: string;
  sku: string;
  barcode: string;
  price: string;
  cost: string;
}

/** Common option sets per kind of product, so the person adding a product starts from sensible choices. */
export function suggestGroups(category: string): string[] {
  const c = category.toLowerCase();
  if (c.includes("cable") || c.includes("wire")) return ["Size", "Colour", "Length", "Cores"];
  if (c.includes("bulb")) return ["Wattage", "Base", "Colour temperature", "Shape"];
  if (c.includes("light") || c.includes("lamp") || c.includes("fan")) return ["Wattage", "Colour temperature", "Colour", "Size"];
  if (c.includes("switch") || c.includes("socket")) return ["Gangs", "Ways", "Colour", "Rating"];
  if (c.includes("protect") || c.includes("breaker") || c.includes("mcb")) return ["Rating", "Ways", "Phase", "Poles"];
  return ["Size", "Colour", "Wattage", "Rating"];
}

const chip = "inline-flex items-center gap-1 rounded-full bg-[#EDEFF9] px-2.5 py-1 text-xs font-semibold text-[#061161]";
const inputCls = "rounded-lg border border-[#DADDE6] bg-white px-3 py-2 text-sm focus:border-[#061161] focus:outline-none";

function combos(groups: OptionGroup[]): Record<string, string>[] {
  const active = groups.filter((g) => g.name.trim() && g.values.length);
  if (!active.length) return [];
  return active.reduce<Record<string, string>[]>(
    (acc, g) => acc.flatMap((a) => g.values.map((v) => ({ ...a, [g.name.trim()]: v }))),
    [{}],
  );
}

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9.]+/g, "").slice(0, 8);

export default function OptionsBuilder({
  category, baseSku, basePrice, baseCost, onRows,
}: {
  category: string;
  baseSku: string;
  basePrice: string;
  baseCost: string;
  onRows: (rows: OptionRow[]) => void;
}) {
  const [groups, setGroups] = useState<OptionGroup[]>([{ name: suggestGroups(category)[0], values: [] }]);
  const [drafts, setDrafts] = useState<string[]>([""]);
  const [edits, setEdits] = useState<Record<string, Partial<OptionRow>>>({});

  const suggestions = useMemo(() => suggestGroups(category), [category]);

  const rows: OptionRow[] = useMemo(() => combos(groups).map((attrs) => {
    const label = Object.values(attrs).join(" · ");
    const key = JSON.stringify(attrs);
    const auto: OptionRow = {
      key, attrs, label,
      sku: `${baseSku || "SKU"}-${Object.values(attrs).map(slug).join("-")}`,
      barcode: "", price: basePrice, cost: baseCost,
    };
    return { ...auto, ...(edits[key] ?? {}) };
  }), [groups, baseSku, basePrice, baseCost, edits]);

  useEffect(() => { onRows(rows); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  function addValues(i: number, raw: string) {
    const vals = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (!vals.length) return;
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, values: [...new Set([...g.values, ...vals])] } : g)));
    setDrafts((d) => d.map((x, j) => (j === i ? "" : x)));
  }
  const setEdit = (key: string, patch: Partial<OptionRow>) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  return (
    <div className="space-y-4 rounded-xl border border-[#C7CCE9] bg-[#F7F8FE] p-4">
      <div>
        <p className="text-sm font-bold text-[#0B0E1A]">Options</p>
        <p className="text-xs text-[#4A5060]">Add each thing that changes (for example Colour or Size) and type its values, separated by commas. We build every combination for you, and shoppers pick from them on the website.</p>
      </div>

      {groups.map((g, i) => (
        <div key={i} className="rounded-lg border border-[#DADDE6] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              list={`opt-names-${i}`}
              value={g.name}
              onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              placeholder="Option name, e.g. Colour"
              className={`${inputCls} w-48 font-semibold`}
            />
            <datalist id={`opt-names-${i}`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
            <input
              value={drafts[i] ?? ""}
              onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addValues(i, drafts[i] ?? ""); } }}
              onBlur={() => addValues(i, drafts[i] ?? "")}
              placeholder="Type a value and press Enter (Red, Black, Blue)"
              className={`${inputCls} min-w-[14rem] flex-1`}
            />
            {groups.length > 1 && (
              <button type="button" onClick={() => { setGroups(groups.filter((_, j) => j !== i)); setDrafts(drafts.filter((_, j) => j !== i)); }} className="text-xs font-semibold text-[#C62828] hover:underline">Remove</button>
            )}
          </div>
          {g.values.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.values.map((v) => (
                <span key={v} className={chip}>
                  {v}
                  <button type="button" aria-label={`Remove ${v}`} onClick={() => setGroups(groups.map((x, j) => (j === i ? { ...x, values: x.values.filter((y) => y !== v) } : x)))} className="text-[#6B7183] hover:text-[#C62828]">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {groups.length < 4 && (
          <button type="button" onClick={() => { setGroups([...groups, { name: suggestions.find((s) => !groups.some((g) => g.name === s)) ?? "", values: [] }]); setDrafts([...drafts, ""]); }}
            className="rounded-lg border border-[#061161] px-3 py-1.5 text-xs font-bold text-[#061161] hover:bg-[#EDEFF9]">+ Add another option</button>
        )}
        <span className="text-xs text-[#6B7183]">Suggestions: {suggestions.join(", ")}</span>
      </div>

      {rows.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-[#0B0E1A]">{rows.length} option combination{rows.length === 1 ? "" : "s"}</p>
          <div className="max-h-80 overflow-auto rounded-lg border border-[#DADDE6] bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-[#F4F5F9] text-left text-[11px] font-bold uppercase text-[#4A5060]">
                <tr><th className="px-3 py-2">Option</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Barcode</th><th className="px-3 py-2 w-28">Price (₵)</th><th className="px-3 py-2 w-28">Cost (₵)</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-[#E8EAF0]">
                    <td className="px-3 py-1.5 font-semibold text-[#0B0E1A]">{r.label}</td>
                    <td className="px-2 py-1"><input value={r.sku} onChange={(e) => setEdit(r.key, { sku: e.target.value })} className={`${inputCls} w-full py-1`} /></td>
                    <td className="px-2 py-1"><input value={r.barcode} onChange={(e) => setEdit(r.key, { barcode: e.target.value })} className={`${inputCls} w-full py-1`} /></td>
                    <td className="px-2 py-1"><input type="number" step="0.01" value={r.price} onChange={(e) => setEdit(r.key, { price: e.target.value })} className={`${inputCls} w-full py-1`} /></td>
                    <td className="px-2 py-1"><input type="number" step="0.01" value={r.cost} onChange={(e) => setEdit(r.key, { cost: e.target.value })} className={`${inputCls} w-full py-1`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-[#6B7183]">Prices start from the price you set above. Change any row that costs more or less, for example a thicker cable.</p>
        </div>
      )}
    </div>
  );
}
