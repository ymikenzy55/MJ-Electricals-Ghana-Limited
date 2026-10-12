"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  ["Wall QR attendance", "Workers scan the office code on their phone. Every scan records the time and place."],
  ["Absences at a glance", "See who is in, who is late and who has not shown up, live."],
  ["Payroll and payments", "Monthly registers, SSNIT and PAYE, and a full log of every payment."],
];

export default function LoginPage() {
  const router = useRouter();
  const { setToken } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login({ username, password });
      setToken(res.access_token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  const field = "h-11 w-full rounded-lg border-[1.5px] border-border bg-white px-3.5 text-sm text-ink outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MJ_Logo.jpg" alt="" className="h-11 w-11 rounded-lg" />
          <div className="leading-tight">
            <p className="text-[15px] font-extrabold tracking-wide">MJ ELECTRICALS</p>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-white/60">PAYROLL &amp; ATTENDANCE</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">Run attendance and payroll from one place.</h2>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                </span>
                <span><span className="block font-bold">{t}</span><span className="text-sm text-white/70">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">MJ Electricals Ghana Limited, Kumasi</p>
      </aside>

      <main className="flex items-center justify-center bg-surface px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MJ_Logo.jpg" alt="MJ Electricals" className="h-14 w-14 rounded-xl" />
            <h1 className="mt-3 text-xl font-extrabold text-ink">MJ Electricals</h1>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted">PAYROLL &amp; ATTENDANCE</p>
          </div>
          <h1 className="hidden text-3xl font-extrabold text-ink lg:block">Administrator sign in</h1>
          <p className="mb-6 mt-1 hidden text-[15px] text-muted lg:block">Use your administrator account to continue.</p>

          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_2px_rgba(11,14,26,0.04)]">
            <div>
              <label htmlFor="u" className="mb-1.5 block text-[13px] font-semibold text-muted">Username</label>
              <input id="u" required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" className={field} />
            </div>
            <div>
              <label htmlFor="p" className="mb-1.5 block text-[13px] font-semibold text-muted">Password</label>
              <div className="relative">
                <input id="p" required type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={`${field} pr-16`} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary">{show ? "Hide" : "Show"}</button>
              </div>
            </div>
            {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs font-semibold text-error">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted">
            Are you a worker? <a href="/worker" className="font-bold text-primary hover:underline">Open the staff attendance app</a>
          </p>
        </div>
      </main>
    </div>
  );
}
