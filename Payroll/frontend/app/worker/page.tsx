"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getWorkerToken, setWorkerSession } from "@/lib/worker";

export default function WorkerLoginPage() {
  const router = useRouter();
  const [ident, setIdent] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getWorkerToken()) router.replace("/worker/home");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ident.trim() || !password) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.workerLogin(ident.trim(), password);
      setWorkerSession(res.access_token, res.employee);
      router.replace("/worker/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#061161] px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MJ_Logo.jpg" alt="MJ Electricals" className="mb-3 h-16 w-16 rounded-xl object-cover shadow-md ring-1 ring-white/20" />
          <h1 className="text-xl font-semibold text-white">Staff Attendance</h1>
          <p className="mt-1 text-sm text-white/60">Sign in to scan in, see your attendance and payslips.</p>
        </div>

        <div className="rounded-2xl bg-white px-6 py-6 shadow-2xl">
          {error && <div className="mb-4 rounded-lg border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <label htmlFor="w-id" className="mb-1.5 block text-[13px] font-medium text-[#5F6368]">Phone number, email or staff code</label>
            <input id="w-id" value={ident} onChange={(e) => setIdent(e.target.value)} autoComplete="username" autoFocus
              className="mb-4 w-full rounded-xl border border-[#E6E7EB] px-3 py-2.5 text-sm focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]" />
            <label htmlFor="w-pw" className="mb-1.5 block text-[13px] font-medium text-[#5F6368]">Password</label>
            <div className="relative mb-5">
              <input id="w-pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                className="w-full rounded-xl border border-[#E6E7EB] px-3 py-2.5 pr-16 text-sm focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#061161]">{show ? "Hide" : "Show"}</button>
            </div>
            <button type="submit" disabled={busy || !ident.trim() || !password}
              className="w-full rounded-xl bg-[#061161] py-2.5 text-sm font-medium text-white transition hover:bg-[#0A1C8C] disabled:opacity-60">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-[#5F6368]">
            New here?{" "}
            <Link href="/worker/register" className="font-semibold text-[#061161] hover:underline">Create your account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
