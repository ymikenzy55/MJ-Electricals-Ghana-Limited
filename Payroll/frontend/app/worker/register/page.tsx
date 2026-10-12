"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";

const box = "w-full rounded-xl border border-[#E6E7EB] px-3 py-2.5 text-sm focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]";
const lbl = "mb-1.5 block text-[13px] font-medium text-[#5F6368]";

export default function WorkerRegisterPage() {
  const [f, setF] = useState({ full_name: "", phone: "", email: "", position: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.password !== f.confirm) { setError("The two passwords don't match."); return; }
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) {
      setError("Use at least 8 characters with letters and numbers."); return;
    }
    setBusy(true);
    try {
      const r = await api.workerRegister({
        full_name: f.full_name.trim(), phone: f.phone.trim(), password: f.password,
        email: f.email.trim() || undefined, position: f.position.trim() || undefined,
      });
      setDone(r.employee_code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#061161] px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MJ_Logo.jpg" alt="MJ Electricals" className="mb-3 h-14 w-14 rounded-xl object-cover ring-1 ring-white/20" />
          <h1 className="text-xl font-semibold text-white">Create your staff account</h1>
          <p className="mt-1 text-sm text-white/60">The administrator approves it before you can sign in.</p>
        </div>
        <div className="rounded-2xl bg-white px-6 py-6 shadow-2xl">
          {done ? (
            <div className="text-center" role="status">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#16803C]/15 text-[#16803C]">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <h2 className="text-base font-bold text-[#111318]">You&apos;re signed up</h2>
              <p className="mt-2 text-sm text-[#5F6368]">Your staff code is <b className="text-[#111318]">{done}</b>. Once the administrator approves your account, sign in with your phone number and password.</p>
              <Link href="/worker" className="mt-5 inline-block rounded-xl bg-[#061161] px-6 py-2.5 text-sm font-medium text-white">Go to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5">
              {error && <div className="rounded-lg border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]" role="alert">{error}</div>}
              <div><label className={lbl} htmlFor="r-n">Full name</label><input id="r-n" required minLength={2} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoComplete="name" className={box} /></div>
              <div><label className={lbl} htmlFor="r-p">Phone number</label><input id="r-p" required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="024 000 0000" className={box} /></div>
              <div><label className={lbl} htmlFor="r-e">Email (optional)</label><input id="r-e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" className={box} /></div>
              <div><label className={lbl} htmlFor="r-r">Your role (optional)</label><input id="r-r" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="e.g. Sales assistant" className={box} /></div>
              <div><label className={lbl} htmlFor="r-w">Password</label><input id="r-w" type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" className={box} /></div>
              <div><label className={lbl} htmlFor="r-c">Confirm password</label><input id="r-c" type="password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" className={box} /></div>
              <button disabled={busy} className="w-full rounded-xl bg-[#061161] py-2.5 text-sm font-medium text-white hover:bg-[#0A1C8C] disabled:opacity-60">{busy ? "Creating…" : "Create account"}</button>
              <p className="text-center text-sm text-[#5F6368]">Already have one? <Link href="/worker" className="font-semibold text-[#061161] hover:underline">Sign in</Link></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
