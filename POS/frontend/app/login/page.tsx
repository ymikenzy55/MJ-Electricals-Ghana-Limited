"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, getStoredUser, login, storeSession } from "@/lib/api";
import { getMeta, setMeta } from "@/lib/offline-db";

const REMEMBER_KEY = "mj_pos_remember";
const REMEMBER_PREF_KEY = "mj_pos_remember_pref";
// Fix #5: key for the locally-cached credential hash used for offline login.
const OFFLINE_CRED_KEY = "mj_pos_offline_cred";

/** SHA-256 of "username:password", stored locally so login works offline. */
async function hashCred(username: string, password: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${username.toLowerCase()}:${password}`),
  );
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = getStoredUser();
    if (existing) {
      router.replace(existing.branch_id == null ? "/portal" : "/dashboard");
      return;
    }
    const pref = localStorage.getItem(REMEMBER_PREF_KEY);
    const wantRemember = pref === null ? true : pref === "1";
    setRemember(wantRemember);
    if (wantRemember) {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) setUsername(saved);
    }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      // Fix #5: cache the credential hash so offline re-auth works next time.
      const hash = await hashCred(username, password);
      await setMeta(OFFLINE_CRED_KEY, { username: username.toLowerCase(), hash });
      if (remember) {
        localStorage.setItem(REMEMBER_PREF_KEY, "1");
        localStorage.setItem(REMEMBER_KEY, username);
      } else {
        localStorage.setItem(REMEMBER_PREF_KEY, "0");
        localStorage.removeItem(REMEMBER_KEY);
      }
      const u = getStoredUser();
      router.replace(u && u.branch_id == null ? "/portal" : "/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        // Network unreachable, try offline credential cache.
        const cached = await getMeta<{ username: string; hash: string }>(OFFLINE_CRED_KEY);
        if (cached && cached.username === username.toLowerCase()) {
          const hash = await hashCred(username, password);
          if (hash === cached.hash) {
            // Restore the last known session so the user can keep working.
            const storedUser = getStoredUser();
            if (storedUser) {
              // Token is already in localStorage from the last online session.
              router.replace(storedUser.branch_id == null ? "/portal" : "/dashboard");
              return;
            }
          }
        }
        setError("Cannot reach the server and no offline session found. Connect to the network and try again.");
      } else {
        setError(err instanceof ApiError ? err.message : "Unable to reach the server");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/new_image_background.jpg')" }}
        aria-hidden="true"
      />
      {/* Dark wash so the card reads clearly */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center">
          <img
            src="/MJ_Logo.jpg"
            alt="MJ Electricals Ghana Limited"
            className="mb-3 h-16 w-16 rounded-xl object-cover shadow-md ring-1 ring-white/20"
          />
          <h1 className="text-lg font-semibold text-white drop-shadow-sm">MJ Electricals Ghana Limited</h1>
          <p className="mt-0.5 text-sm text-white/80">Sign in to your account</p>
        </div>

        {/* Login card */}
        <div className="rounded-xl border border-white/10 bg-white px-8 py-8 shadow-2xl">
          {error && (
            <div
              className="mb-4 rounded-xl border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={submit}>
            {/* Username */}
            <div className="mb-4">
              <label htmlFor="username" className="mb-1.5 block text-[13px] font-medium text-[#4A5060]">
                Username or email
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="Enter username or email"
                className="w-full rounded-xl border border-[#DADDE6] bg-white px-3 py-2.5 text-sm text-[#0B0E1A] placeholder:text-[#4A5060]/60 focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]"
              />
            </div>

            {/* Password */}
            <div className="mb-4">
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[#4A5060]">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  className="w-full rounded-xl border border-[#DADDE6] bg-white px-3 py-2.5 pr-10 text-sm text-[#0B0E1A] placeholder:text-[#4A5060]/60 focus:border-[#061161] focus:outline-none focus:ring-1 focus:ring-[#061161]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#4A5060] hover:text-[#0B0E1A]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="mb-5 flex items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={remember}
                onClick={() => setRemember((r) => !r)}
                className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                  remember
                    ? "border-[#061161] bg-[#061161] text-white"
                    : "border-[#DADDE6] bg-white text-transparent"
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>
              <label
                onClick={() => setRemember((r) => !r)}
                className="cursor-pointer select-none text-sm text-[#4A5060]"
              >
                Remember me
              </label>
            </div>

            {/* Login button */}
            <button
              type="submit"
              disabled={busy || !username || !password}
              className="w-full rounded-xl bg-[#061161] py-2.5 text-sm font-medium text-white transition hover:bg-[#0A1C8C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Login"}
            </button>
          </form>

          {/* Forgotten password */}
          <div className="mt-5 border-t border-[#DADDE6] pt-4 text-center">
            <p className="text-sm text-[#4A5060]">
              Forgot your password?{" "}
              <span className="font-medium text-[#0B0E1A]">
                Contact your administrator to reset it.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
