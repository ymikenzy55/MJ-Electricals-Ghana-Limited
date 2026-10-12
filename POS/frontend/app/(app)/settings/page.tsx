"use client";

import { useEffect, useState } from "react";
import { api, apiDownload, ApiError } from "@/lib/api";
import { Alert, Button, Field, PageHeader } from "@/components/ui";
import { useOffline } from "@/lib/offline-context";

interface Settings {
  company_name: string; company_tin: string; company_address: string; company_phone: string; company_email: string;
  receipt_footer: string; tax_rate: number; tax_inclusive: boolean; return_window_days: number;
}
interface Backup { name: string; size: number; created_at: string }

const inputCls = "w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none focus:ring-2 focus:ring-[#061161]/20";

export default function SettingsPage() {
  const { serverSync } = useOffline();
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState<Backup[] | null>(null);

  useEffect(() => {
    api<Settings>("/api/v1/settings").then(setS).catch((e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not load settings" }));
  }, []);
  useEffect(() => {
    if (serverSync) api<Backup[]>("/api/v1/system/backups").then(setBackups).catch(() => setBackups(null));
  }, [serverSync]);

  if (!s) return <div className="p-6 text-sm text-[#4A5060]">{msg ? <Alert>{msg.text}</Alert> : "Loading settings…"}</div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save() {
    if (!s) return;
    setSaving(true); setMsg(null);
    try {
      setS(await api<Settings>("/api/v1/settings", { method: "PUT", body: s }));
      setMsg({ ok: true, text: "Settings saved. They apply to receipts and tax straight away and sync to every terminal." });
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save" }); }
    finally { setSaving(false); }
  }

  async function backupNow() {
    try {
      await api("/api/v1/system/backups", { method: "POST" });
      setBackups(await api<Backup[]>("/api/v1/system/backups"));
      setMsg({ ok: true, text: "Backup created." });
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Backup failed" }); }
  }
  async function download() {
    try {
      const blob = await apiDownload("/api/v1/system/backups/download");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `mjpos_backup_${new Date().toISOString().slice(0, 10)}.db`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Download failed" }); }
  }

  return (
    <div className="min-h-full bg-[#EDEFF9]">
      <PageHeader title="Settings" breadcrumb="Administration / Settings" subtitle="Company details, tax and receipts"
        actions={<Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>} />
      <div className="max-w-4xl space-y-6 p-4 sm:p-6">
        {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}

        <section className="rounded-xl border border-[#DADDE6] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">Company & receipt</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" required><input value={s.company_name} onChange={(e) => set("company_name", e.target.value)} className={inputCls} /></Field>
            <Field label="TIN"><input value={s.company_tin} onChange={(e) => set("company_tin", e.target.value)} className={inputCls} /></Field>
            <Field label="Address"><input value={s.company_address} onChange={(e) => set("company_address", e.target.value)} className={inputCls} /></Field>
            <Field label="Phone"><input value={s.company_phone} onChange={(e) => set("company_phone", e.target.value)} className={inputCls} /></Field>
            <Field label="Email"><input type="email" value={s.company_email} onChange={(e) => set("company_email", e.target.value)} className={inputCls} /></Field>
            <Field label="Receipt footer"><input maxLength={200} value={s.receipt_footer} onChange={(e) => set("receipt_footer", e.target.value)} className={inputCls} /></Field>
          </div>
        </section>

        <section className="rounded-xl border border-[#DADDE6] bg-white p-6">
          <h2 className="mb-1 text-base font-semibold">Tax</h2>
          <p className="mb-4 text-xs text-[#4A5060]">Ghana&apos;s standard combined levy is 21.9% (VAT 15% + NHIL 2.5% + GETFund 2.5% + COVID levy 1%). Leave at 0 if you don&apos;t charge tax.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tax rate (%)"><input type="number" min="0" max="100" step="0.1" value={+(s.tax_rate * 100).toFixed(2)} onChange={(e) => set("tax_rate", Math.min(Math.max((parseFloat(e.target.value) || 0) / 100, 0), 1))} className={inputCls} /></Field>
            <Field label="Shelf prices">
              <select value={s.tax_inclusive ? "1" : "0"} onChange={(e) => set("tax_inclusive", e.target.value === "1")} className={inputCls}>
                <option value="1">Include tax</option><option value="0">Exclude tax (added at checkout)</option>
              </select>
            </Field>
            <Field label="Return window (days)"><input type="number" min="0" max="365" value={s.return_window_days} onChange={(e) => set("return_window_days", parseInt(e.target.value) || 0)} className={inputCls} /></Field>
          </div>
        </section>

        {serverSync && (
          <section className="rounded-xl border border-[#DADDE6] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Offline data backups</h2>
                <p className="text-xs text-[#4A5060]">This computer keeps a full copy of your data. A backup is made automatically every 12 hours (last 14 kept).</p>
              </div>
              <div className="flex gap-2"><Button variant="secondary" onClick={backupNow}>Back up now</Button><Button variant="secondary" onClick={download}>Download copy</Button></div>
            </div>
            {backups && backups.length > 0 && (
              <ul className="mt-4 divide-y divide-[#DADDE6] rounded-xl border border-[#DADDE6] text-sm">
                {backups.slice(0, 6).map((b) => (
                  <li key={b.name} className="flex justify-between px-4 py-2"><span className="font-mono text-xs">{b.name}</span><span className="text-xs text-[#4A5060]">{new Date(b.created_at).toLocaleString()} · {(b.size / 1024 / 1024).toFixed(1)} MB</span></li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-[#6B7183]">Backups are stored in <span className="font-mono">POS\backend\data\backups</span>. To restore, close the POS, replace <span className="font-mono">mjpos_local.db</span> with a backup file, and reopen it.</p>
          </section>
        )}
      </div>
    </div>
  );
}
