"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import AuthShell from "@/components/AuthShell";
import { useAuth } from "@/lib/auth";
import { PasswordInput, inputCls, labelCls } from "@/components/form";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stay, setStay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login({ email, password });
      login(res.access_token, res.user, stay);
      router.push(params.get("next") || "/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell heading="Welcome back" text="Sign in to follow your orders, check out faster and keep your details saved.">
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-6 sm:py-16 sm:px-6">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Sign In</h1>
      <p className="mt-1 text-sm text-muted">Access your orders and faster checkout.</p>
      <form onSubmit={submit} className="mt-5 sm:mt-8 space-y-4 rounded-2xl border border-border bg-white p-6">
        <div>
          <label className={labelCls}>Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            autoComplete="email"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <PasswordInput
            required
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={stay}
            onChange={(e) => setStay(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Stay logged in
        </label>
        {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? "Signing in…" : "Sign In"}
        </button>
        <p className="text-center text-xs text-muted">
          No account?{" "}
          <Link href={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-semibold text-primary hover:underline">
            Create one
          </Link>
        </p>
        <p className="text-center text-xs text-muted">
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">Forgot password?</Link>
        </p>
      </form>
    </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
