"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface CartLine {
  /** variantId + optionLabel, distinguishes option choices of the same variant */
  lineKey: string;
  variantId: number;
  productId: number;
  productName: string;
  variantName: string;
  optionLabel: string | null;
  sku: string;
  unit: string;
  price: number;
  image: string | null;
  quantity: number;
  maxQuantity: number;
}

interface CartCtx {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity" | "lineKey">, qty?: number) => void;
  setQty: (lineKey: string, qty: number) => void;
  remove: (lineKey: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "mj_web_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  const add: CartCtx["add"] = (line, qty = 1) => {
    const lineKey = `${line.variantId}|${line.optionLabel ?? ""}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.lineKey === lineKey);
      if (existing) {
        return prev.map((l) =>
          l.lineKey === lineKey
            ? { ...l, quantity: Math.min(l.quantity + qty, l.maxQuantity || 9999) }
            : l
        );
      }
      return [...prev, { ...line, lineKey, quantity: Math.min(qty, line.maxQuantity || 9999) }];
    });
  };

  const setQty = (lineKey: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.lineKey !== lineKey)
        : prev.map((l) =>
            l.lineKey === lineKey
              ? { ...l, quantity: Math.min(qty, l.maxQuantity || 9999) }
              : l
          )
    );
  };

  const remove = (lineKey: string) =>
    setLines((prev) => prev.filter((l) => l.lineKey !== lineKey));

  const clear = () => setLines([]);

  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  return (
    <Ctx.Provider value={{ lines, add, setQty, remove, clear, count, subtotal }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
