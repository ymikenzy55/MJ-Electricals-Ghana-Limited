"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type WebsiteUser } from "./api";

interface AuthCtx {
  user: WebsiteUser | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: WebsiteUser, persist?: boolean) => void;
  logout: () => void;
  /** Re-read the profile from the server. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "mj_web_token";

function readToken(): string | null {
  try { return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY); } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<WebsiteUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = readToken();
    if (!t) { setLoading(false); return; }
    api.me(t)
      .then((u) => { setToken(t); setUser(u); })
      .catch((e) => {
        // Only drop the session when the server says it is invalid, a
        // network blip must not sign the customer out.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch {}
        } else {
          setToken(t);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = (t: string, u: WebsiteUser, persist = true) => {
    try {
      if (persist) { localStorage.setItem(KEY, t); sessionStorage.removeItem(KEY); }
      else { sessionStorage.setItem(KEY, t); localStorage.removeItem(KEY); }
    } catch {}
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch {}
    setToken(null);
    setUser(null);
  };

  const refresh = useCallback(async () => {
    const t = readToken();
    if (t) setUser(await api.me(t));
  }, []);

  return <Ctx.Provider value={{ user, token, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
