"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

interface AuthCtx {
  token: string | null;
  loading: boolean;
  setToken: (t: string | null) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "mj_payroll_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setTokenState(localStorage.getItem(KEY));
    setLoading(false);
  }, []);

  // Route guard: everything except /login and /kiosk requires auth.
  useEffect(() => {
    if (loading) return;
    const publicPaths = ["/login", "/kiosk", "/worker", "/sso"];
    if (!token && !publicPaths.some((p) => pathname.startsWith(p))) {
      router.replace("/login");
    }
    if (token && pathname === "/login") {
      router.replace("/dashboard");
    }
  }, [token, loading, pathname, router]);

  const setToken = (t: string | null) => {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
    setTokenState(t);
  };

  const logout = () => {
    setToken(null);
    router.push("/login");
  };

  return (
    <Ctx.Provider value={{ token, loading, setToken, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
