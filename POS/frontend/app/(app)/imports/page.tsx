"use client";

import { useState } from "react";
import { apiFormData, ApiError } from "@/lib/api";
import { PageHeader, cedi } from "@/components/ui";

export default function ImportsPage() {
  return (
    <ImportScreen />
  );
}

interface PreviewRow {
  row: number; name: string; sku: string; barcode: string | null;
  category: string | null; brand: string | null; variant: string;
  unit: string; cost_price: string | null; selling_price: string; reorder_level: string;
}
interface PreviewResult {
  total_rows: number; valid_rows: number; error_rows: number;
  preview: PreviewRow[]; errors: { row: number; errors: string[] }[];
}

function ImportScreen() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<{ products_created: number; variants_created: number; skipped_duplicates: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    if (!file) return;
    setError(null); setPreview(null); setResult(null);
    setBusy(true);
    try {
      const data = await apiFormData<PreviewResult>("/api/v1/imports/products/preview", file);
      setPreview(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const data = await apiFormData<{ products_created: number; variants_created: number; skipped_duplicates: number }>("/api/v1/imports/products/confirm", file);
      setResult(data);
      setPreview(null);
      setFile(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Import Products from Excel" breadcrumb="Import Products from Excel" />

      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}
      {result && (
        <div className="mb-4 rounded border border-[#16803C]/30 bg-[#16803C]/10 px-3 py-2 text-sm text-[#16803C]">
          Import complete: {result.products_created} products created, {result.variants_created} variants created, {result.skipped_duplicates} duplicates skipped.
        </div>
      )}

      <div className="mb-6 rounded-xl border border-[#DADDE6] bg-white p-5">
        <p className="mb-4 text-sm text-[#4A5060]">
          Upload an Excel file (.xlsx) with the following columns:
          <strong> Product Name, SKU, Barcode, Category, Brand, Variant, Unit, Cost Price, Selling Price, Reorder Level</strong>
        </p>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); }}
            className="text-sm"
          />
          <button onClick={doPreview} disabled={!file || busy} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">
            {busy ? "Processing..." : "Preview"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="rounded-xl border border-[#DADDE6] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span className="text-[#4A5060]">Total rows: <strong>{preview.total_rows}</strong></span>
              <span className="text-[#16803C]">Valid: <strong>{preview.valid_rows}</strong></span>
              {preview.error_rows > 0 && <span className="text-[#C62828]">Errors: <strong>{preview.error_rows}</strong></span>}
            </div>
            {preview.error_rows === 0 && preview.valid_rows > 0 && (
              <button onClick={doConfirm} disabled={busy} className="rounded-full bg-[#16803C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#106B32] disabled:opacity-50">
                {busy ? "Importing..." : `Confirm Import (${preview.valid_rows} rows)`}
              </button>
            )}
          </div>

          {preview.errors.length > 0 && (
            <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 p-3">
              <h3 className="mb-2 text-sm font-semibold text-[#C62828]">Errors ({preview.error_rows} rows)</h3>
              <div className="max-h-40 overflow-auto text-xs text-[#C62828]">
                {preview.errors.map((e) => (
                  <div key={e.row} className="py-0.5">Row {e.row}: {e.errors.join("; ")}</div>
                ))}
              </div>
            </div>
          )}

          <h3 className="mb-2 text-sm font-semibold text-[#4A5060]">Preview (first 20 valid rows)</h3>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#FAFAFC] text-left uppercase text-[#6B7183]">
                <tr>
                  <th className="px-2 py-1">Row</th><th className="px-2 py-1">Product</th><th className="px-2 py-1">SKU</th>
                  <th className="px-2 py-1">Barcode</th><th className="px-2 py-1">Category</th><th className="px-2 py-1">Brand</th>
                  <th className="px-2 py-1">Variant</th><th className="px-2 py-1 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((r) => (
                  <tr key={r.row} className="border-t border-[#DADDE6]">
                    <td className="px-2 py-1 text-[#6B7183]">{r.row}</td>
                    <td className="px-2 py-1 font-medium">{r.name}</td>
                    <td className="px-2 py-1">{r.sku}</td>
                    <td className="px-2 py-1 text-[#4A5060]">{r.barcode ?? "-"}</td>
                    <td className="px-2 py-1">{r.category ?? "-"}</td>
                    <td className="px-2 py-1">{r.brand ?? "-"}</td>
                    <td className="px-2 py-1">{r.variant}</td>
                    <td className="px-2 py-1 text-right">{cedi(r.selling_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

