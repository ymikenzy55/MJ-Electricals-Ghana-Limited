"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

const input = "h-11 w-full rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-primary";

function Inner() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.resetPassword({ token: token.trim(), password }); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not reset your password"); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6 sm:py-16">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Reset password</h1>
      {done ? (
        <div className="mt-5 sm:mt-8 rounded-xl bg-success/10 p-5 text-sm text-success" role="status">
          Your password has been changed. <Link href="/login" className="font-bold underline">Sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 sm:mt-8 space-y-4">
          {!params.get("token") && (
            <input required value={token} onChange={(e) => setToken(e.target.value)} placeholder="Reset code from your email" className={input} aria-label="Reset code" />
          )}
          <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (8+ characters, letters and numbers)" className={input} aria-label="New password" />
          {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{error}</p>}
          <button disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">{busy ? "Saving…" : "Set new password"}</button>
        </form>
      )}
      <Link href="/login" className="mt-6 block text-sm font-semibold text-primary">Back to sign in</Link>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
