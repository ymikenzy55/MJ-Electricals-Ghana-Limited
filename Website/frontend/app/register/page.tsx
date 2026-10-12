"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import AuthShell from "@/components/AuthShell";
import { useAuth } from "@/lib/auth";
import { PasswordInput, PhoneInput, inputCls, labelCls } from "@/components/form";

function RegisterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.phone.length < 13) {
      setError("Enter a valid phone number, 9 digits after +233");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.register({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        address: form.address || undefined,
      });
      login(res.access_token, res.user);
      router.push(params.get("next") || "/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell heading="Join MJ Electricals" text="Create a free account to track orders, save your address and shop faster next time.">
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-6 sm:py-16 sm:px-6">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Create Account</h1>
      <p className="mt-1 text-sm text-muted">Track orders and check out faster.</p>
      <form onSubmit={submit} className="mt-5 sm:mt-8 space-y-4 rounded-2xl border border-border bg-white p-6">
        <div>
          <label className={labelCls}>Full name</label>
          <input required minLength={2} value={form.full_name} onChange={set("full_name")} placeholder="Enter your full name" autoComplete="name" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input required type="email" value={form.email} onChange={set("email")} placeholder="Enter your email address" autoComplete="email" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <PhoneInput required value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="Enter 9-digit phone number" />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <PasswordInput
            required
            minLength={8}
            showStrength
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="Min. 8 characters, letters and numbers"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className={labelCls}>Address (optional)</label>
          <input value={form.address} onChange={set("address")} placeholder="Enter your delivery address" autoComplete="street-address" className={inputCls} />
        </div>
        {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? "Creating account…" : "Create Account"}
        </button>
        <p className="text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href={`/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
