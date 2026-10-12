"use client";

import { useCallback, useEffect, useState } from "react";
import { api, cedi, fmtDate, type Holiday, type PayrollSettings, type TaxBand } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Field, PageHeader, Spinner, inputCls } from "@/components/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
      <span><span className="block text-sm font-semibold text-ink">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

export default function SettingsPage() {
  const { token } = useAuth();
  const [s, setS] = useState<PayrollSettings | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [hol, setHol] = useState({ date: "", name: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });

  const loadHolidays = useCallback(() => {
    if (token) api.holidays(token, year).then(setHolidays).catch(() => {});
  }, [token, year]);

  useEffect(() => { if (token) api.settings(token).then(setS).catch((e) => setMsg({ ok: false, text: e.message })); }, [token]);
  useEffect(loadHolidays, [loadHolidays]);

  if (!s || !token) return <Spinner />;
  const set = <K extends keyof PayrollSettings>(k: K, v: PayrollSettings[K]) => setS({ ...s, [k]: v });
  const weekdays = new Set(s.working_days_of_week.split(",").filter(Boolean).map(Number));

  async function save() {
    if (!s || !token) return;
    setSaving(true); setMsg(null);
    try {
      const { ...body } = s;
      const out = await api.updateSettings(token, {
        ...body,
        ssnit_employee_rate: body.ssnit_employee_rate, ssnit_employer_rate: body.ssnit_employer_rate,
      });
      setS(out); setMsg({ ok: true, text: "Settings saved. New rates apply to payroll runs created or recalculated from now on." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" }); }
    finally { setSaving(false); }
  }

  const setBand = (i: number, patch: Partial<TaxBand>) => set("tax_bands", s.tax_bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  async function changePassword() {
    if (!token) return;
    if (pw.new_password !== pw.confirm) { setMsg({ ok: false, text: "New passwords do not match" }); return; }
    try {
      await api.changePassword(token, { current_password: pw.current_password, new_password: pw.new_password });
      setPw({ current_password: "", new_password: "", confirm: "" });
      setMsg({ ok: true, text: "Password changed." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Settings" breadcrumb="Payroll / Settings" subtitle="Company details, Ghana statutory rates and payroll policy"
        actions={<Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>} />
      {msg && <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>{msg.text}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Company (printed on payslips)">
          <div className="space-y-3">
            <Field label="Company name"><input value={s.company_name} onChange={(e) => set("company_name", e.target.value)} className={inputCls} /></Field>
            <Field label="Address"><input value={s.company_address ?? ""} onChange={(e) => set("company_address", e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><input value={s.company_phone ?? ""} onChange={(e) => set("company_phone", e.target.value)} className={inputCls} /></Field>
              <Field label="Company TIN"><input value={s.company_tin ?? ""} onChange={(e) => set("company_tin", e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Employer SSNIT number"><input value={s.company_ssnit_no ?? ""} onChange={(e) => set("company_ssnit_no", e.target.value)} className={inputCls} /></Field>
          </div>
        </Card>

        <Card title="SSNIT pension">
          <div className="space-y-3">
            <Toggle checked={s.ssnit_enabled} onChange={(v) => set("ssnit_enabled", v)} label="Deduct SSNIT" hint="Calculated on basic pay. Individual employees can be exempted on their profile." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Employee rate (%)"><input type="number" step="0.01" min="0" max="100" value={(parseFloat(s.ssnit_employee_rate) * 100).toFixed(2)} onChange={(e) => set("ssnit_employee_rate", String((parseFloat(e.target.value) || 0) / 100))} className={inputCls} /></Field>
              <Field label="Employer rate (%)"><input type="number" step="0.01" min="0" max="100" value={(parseFloat(s.ssnit_employer_rate) * 100).toFixed(2)} onChange={(e) => set("ssnit_employer_rate", String((parseFloat(e.target.value) || 0) / 100))} className={inputCls} /></Field>
            </div>
          </div>
        </Card>

        <Card title="PAYE income tax (monthly bands)">
          <Toggle checked={s.paye_enabled} onChange={(v) => set("paye_enabled", v)} label="Deduct PAYE" hint="Progressive tax on basic + taxable allowances + overtime, after SSNIT relief." />
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-muted"><th className="pb-1">Band</th><th className="pb-1">Slice width (₵)</th><th className="pb-1">Rate (%)</th><th /></tr></thead>
            <tbody>
              {s.tax_bands.map((b, i) => {
                const last = i === s.tax_bands.length - 1;
                return (
                  <tr key={i}>
                    <td className="py-1 pr-2 text-xs text-muted">{last ? "Above" : `Next`}</td>
                    <td className="py-1 pr-2">{last ? <span className="text-xs text-faint">remainder</span> :
                      <input type="number" min="0" step="0.01" value={b.width ?? ""} onChange={(e) => setBand(i, { width: parseFloat(e.target.value) || 0 })} className={`${inputCls} h-9`} />}</td>
                    <td className="py-1 pr-2"><input type="number" min="0" max="100" step="0.1" value={+(b.rate * 100).toFixed(2)} onChange={(e) => setBand(i, { rate: (parseFloat(e.target.value) || 0) / 100 })} className={`${inputCls} h-9`} /></td>
                    <td>{!last && s.tax_bands.length > 2 && <button onClick={() => set("tax_bands", s.tax_bands.filter((_, j) => j !== i))} className="text-xs text-error">✕</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={() => set("tax_bands", [...s.tax_bands.slice(0, -1), { width: 1000, rate: 0.3 }, s.tax_bands[s.tax_bands.length - 1]])} className="mt-2 text-xs font-semibold text-primary hover:underline">+ Add band</button>
          <p className="mt-3 text-xs text-faint">Defaults follow the GRA resident rates in force since 2024 (first {cedi(490)} tax-free … 35% above {cedi(50416.67)}). Confirm against the current GRA schedule before each tax year.</p>
        </Card>

        <Card title="Working time & pay policy">
          <div className="space-y-3">
            <Field label="Working days">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <button key={d} type="button" onClick={() => { const n = new Set(weekdays); n.has(i) ? n.delete(i) : n.add(i); if (n.size) set("working_days_of_week", [...n].sort().join(",")); }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${weekdays.has(i) ? "bg-primary text-white" : "border border-border text-muted"}`}>{d}</button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Work starts"><input type="time" value={s.work_start_time} onChange={(e) => set("work_start_time", e.target.value)} className={inputCls} /></Field>
              <Field label="Late grace (minutes)"><input type="number" min="0" value={s.late_grace_minutes} onChange={(e) => set("late_grace_minutes", parseInt(e.target.value) || 0)} className={inputCls} /></Field>
              <Field label="Standard hours / day"><input type="number" min="1" step="0.5" value={s.standard_hours_per_day} onChange={(e) => set("standard_hours_per_day", e.target.value)} className={inputCls} /></Field>
              <Field label="Days / month (hourly rate)"><input type="number" min="1" max="31" value={s.working_days_per_month} onChange={(e) => set("working_days_per_month", parseInt(e.target.value) || 26)} className={inputCls} /></Field>
              <Field label="Annual leave (days)"><input type="number" min="0" value={s.annual_leave_days} onChange={(e) => set("annual_leave_days", parseInt(e.target.value) || 0)} className={inputCls} /></Field>
            </div>
            <Toggle checked={s.overtime_enabled} onChange={(v) => set("overtime_enabled", v)} label="Pay overtime" hint="Hours beyond the standard day, plus all hours on rest days and public holidays." />
            {s.overtime_enabled && <Field label="Overtime multiplier (×)"><input type="number" min="1" step="0.1" value={s.overtime_multiplier} onChange={(e) => set("overtime_multiplier", e.target.value)} className={inputCls} /></Field>}
            <Toggle checked={s.late_deduction_enabled} onChange={(v) => set("late_deduction_enabled", v)} label="Deduct for late arrivals" />
            {s.late_deduction_enabled && <Field label="Deduction per late day (₵)"><input type="number" min="0" step="0.01" value={s.late_deduction_amount} onChange={(e) => set("late_deduction_amount", e.target.value)} className={inputCls} /></Field>}
          </div>
        </Card>

        <Card title="Attendance location">
          <div className="space-y-3">
            <p className="text-sm text-muted">Workers scan the wall QR code on their phone. A scan is accepted only when the phone is within the distance below of this point.</p>
            <Field label="Office name"><input value={s.office_name} onChange={(e) => set("office_name", e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude"><input inputMode="decimal" value={s.office_lat} onChange={(e) => set("office_lat", e.target.value)} className={inputCls} /></Field>
              <Field label="Longitude"><input inputMode="decimal" value={s.office_lng} onChange={(e) => set("office_lng", e.target.value)} className={inputCls} /></Field>
              <Field label="Allowed distance (metres)"><input type="number" min="20" max="2000" value={s.geofence_radius_m} onChange={(e) => set("geofence_radius_m", parseInt(e.target.value) || 120)} className={inputCls} /></Field>
              <Field label="Minutes before check out"><input type="number" min="0" max="600" value={s.min_checkout_minutes} onChange={(e) => set("min_checkout_minutes", parseInt(e.target.value) || 0)} className={inputCls} /></Field>
            </div>
            <Button variant="secondary" onClick={() => navigator.geolocation?.getCurrentPosition((p) => { set("office_lat", p.coords.latitude.toFixed(6)); set("office_lng", p.coords.longitude.toFixed(6)); })}>Use my current location</Button>
          </div>
        </Card>

        <Card title="Change admin password">
          <div className="space-y-3">
            <Field label="Current password"><input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className={inputCls} /></Field>
            <Field label="New password (min 8 characters)"><input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className={inputCls} /></Field>
            <Field label="Confirm new password"><input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={inputCls} /></Field>
            <Button onClick={changePassword} disabled={!pw.current_password || pw.new_password.length < 8}>Update password</Button>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Public holidays (paid, never counted as absence)" action={
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className={`${inputCls} h-9 w-auto`}>
            {[-1, 0, 1, 2].map((d) => <option key={d} value={new Date().getFullYear() + d}>{new Date().getFullYear() + d}</option>)}
          </select>}>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Date"><input type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} className={`${inputCls} w-auto`} /></Field>
            <Field label="Name"><input value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} className={inputCls} placeholder="e.g. Eid al-Fitr" /></Field>
            <Button disabled={!hol.date || hol.name.length < 2} onClick={async () => { try { await api.addHoliday(token, hol); setHol({ date: "", name: "" }); loadHolidays(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" }); } }}>Add</Button>
          </div>
          <p className="mb-3 text-xs text-muted">Fixed-date holidays are pre-loaded. Add moveable ones (Good Friday, Easter Monday, Eid, Farmers&apos; Day) when they are announced.</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                <span><span className="font-semibold text-ink">{h.name}</span> <span className="text-xs text-faint">{fmtDate(h.date)}</span></span>
                <button onClick={async () => { await api.deleteHoliday(token, h.id); loadHolidays(); }} className="text-xs font-semibold text-error hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
