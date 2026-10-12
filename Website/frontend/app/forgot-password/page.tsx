"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try { const result = await api.requestPasswordReset(email); setMessage(result.message); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
  }
  return <main className="mx-auto max-w-md px-4 py-6 sm:py-16"><h1 className="text-2xl sm:text-3xl font-black text-ink">Forgot password?</h1><p className="mt-2 text-sm text-muted">Enter your account email to receive reset instructions.</p><form onSubmit={submit} className="mt-5 sm:mt-8 space-y-4"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-11 w-full rounded-full border border-border px-4 text-sm" /><button className="w-full rounded-full bg-primary py-3 text-sm font-bold text-white">Send instructions</button></form>{message && <p className="mt-4 text-sm text-muted">{message}</p>}<Link href="/login" className="mt-6 block text-sm font-semibold text-primary">Back to sign in</Link></main>;
}