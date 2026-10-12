"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface WishlistCtx {
  ids: number[];
  has: (id: number) => boolean;
  toggle: (id: number) => void;
}

const Ctx = createContext<WishlistCtx | null>(null);
const KEY = "mj_web_wishlist";

/** Saved products live in the browser (no account needed). */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setIds(JSON.parse(raw).filter((n: unknown) => Number.isInteger(n)));
    } catch {}
  }, []);

  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 200);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ ids, has: (id) => ids.includes(id), toggle }}>{children}</Ctx.Provider>;
}

export function useWishlist(): WishlistCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWishlist must be used inside WishlistProvider");
  return ctx;
}
