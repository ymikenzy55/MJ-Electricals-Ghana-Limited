"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Single sign-on handoff from the POS module portal.
 *  Reads the POS JWT from the URL hash, exchanges it for a payroll admin
 *  token via the payroll backend (which verifies it against the POS),
 *  then lands on the dashboard. */
export default function SsoPage() {
  const router = useRouter();
  const { setToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const posToken = window.location.hash.replace(/^#token=/, "");
    if (!posToken) {
      setError("Missing session token. Open payroll from the POS module portal.");
      return;
    }
    // Strip the token from the address bar immediately.
    window.history.replaceState(null, "", "/sso");
    api
      .posSso(posToken)
      .then((r) => {
        setToken(r.access_token);
        router.replace("/dashboard");
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Could not sign you in")
      );
  }, [router, setToken]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-dark px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/MJ_Logo.jpg" alt="MJ Electricals" className="h-14 w-14 rounded-2xl" />
      {error ? (
        <div className="mt-6 w-full max-w-sm rounded-xl border border-error/30 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-error">{error}</p>
          <a href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
            Go to payroll sign in
          </a>
        </div>
      ) : (
        <>
          <div className="mt-6 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="mt-4 text-sm text-white/60">Signing you in…</p>
        </>
      )}
    </div>
  );
}
