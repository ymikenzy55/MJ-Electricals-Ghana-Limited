"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconPrint, IconX, IconSearch } from "@/components/Icons";
import { Pagination } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, ApiError, getStoredUser } from "@/lib/api";
import { cacheCatalog, enqueueSale, readCatalog, holdSaleLocally, readHeldSalesLocally, removeHeldSaleLocally } from "@/lib/offline-db";
import { useOffline } from "@/lib/offline-context";
import type {
  Branch,
  CartLine,
  Customer,
  Paginated,
  PosConfig,
  Sale,
  Shift,
  VariantLookup,
} from "@/lib/types";

const cedi = (n: number) =>
  `₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_METHODS = [
  { val: "CASH", label: "Cash" },
  { val: "MOBILE_MONEY", label: "Mobile Money" },
  { val: "CARD", label: "Card" },
  { val: "BANK_TRANSFER", label: "Bank Transfer" },
];

const PAGE_SIZE = 50;

/** A sale rendered from local data when it was captured offline. */
interface OfflineReceipt {
  offline: true;
  transaction_id: string;
  sold_at: string;
  lines: { product_name: string; variant_name: string; quantity: number; unit_price: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: string;
  customer_name: string | null;
  customer_phone: string | null;
  change: number;
}

export default function PosPage() {
  return <PosScreen />;
}

function PosScreen() {
  const user = getStoredUser();
  const userBranchId = user?.branch_id ?? null;
  const { online } = useOffline();
  const showToast = useToast();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(userBranchId);
  const [branchesLoaded, setBranchesLoaded] = useState(userBranchId !== null);
  const [config, setConfig] = useState<PosConfig | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);

  // Catalog
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<VariantLookup[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [cacheStale, setCacheStale] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Cart
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitLines, setSplitLines] = useState<{ method: string; amount: string }[]>([
    { method: "CASH", amount: "" },
    { method: "MOBILE_MONEY", amount: "" },
  ]);

  // Customer
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustBusy, setNewCustBusy] = useState(false);
  const [addCustomer, setAddCustomer] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // UI
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Sale | OfflineReceipt | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [held, setHeld] = useState<{ id: number | string; label: string | null; cart_data: unknown; offline?: boolean }[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const custTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const canDiscount = user?.permissions.includes("discounts.apply") ?? false;
  const canHold = user?.permissions.includes("sales.hold") ?? false;
  const canShift = user?.permissions.includes("shifts.operate") ?? false;

  /* ------------------------------- bootstrap ------------------------------ */
  useEffect(() => {
    const tasks: Promise<unknown>[] = [];
    tasks.push(
      api<PosConfig>("/api/v1/config")
        .then(setConfig)
        .catch(() => setConfig(null)),
    );
    if (userBranchId === null) {
      tasks.push(
        api<Branch[]>("/api/v1/branches")
          .then((bs) => {
            setBranches(bs);
            if (bs.length > 0) setBranchId(bs[0].id);
            setBranchesLoaded(true);
          })
          .catch(() => setBranchesLoaded(true)),
      );
    } else {
      setBranchesLoaded(true);
    }
    if (canShift) {
      tasks.push(
        api<Shift | null>("/api/v1/shifts/current")
          .then(setShift)
          .catch(() => setShift(null)),
      );
    }
    Promise.allSettled(tasks);
  }, [userBranchId, canShift]);

  useEffect(() => {
    if (userBranchId === null) return;
    let cancelled = false;
    readCatalog(userBranchId).then((cached) => {
      if (cancelled || !cached || cached.items.length === 0) return;
      setProducts(cached.items.slice(0, PAGE_SIZE));
      setTotal(cached.items.length);
      setFromCache(true);
      setCacheStale(cached.stale);
    });
    return () => {
      cancelled = true;
    };
  }, [userBranchId]);

  /* -------------------------------- catalog ------------------------------- */
  const loadProducts = useCallback(
    async (p: number, q: string, bid: number) => {
      setCatalogLoading(true);
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await api<Paginated<VariantLookup>>("/api/v1/pos/browse", {
          params: { branch_id: bid, q, page: p, page_size: PAGE_SIZE },
        });
        if (controller.signal.aborted) return;
        setProducts(data.items);
        setTotal(data.total);
        setFromCache(false);
        setCacheStale(false);
        if (p === 1 && !q) cacheCatalog(bid, data.items);
        // Fix #7: if there are more pages, prefetch the rest in the background
        // so the full catalog is available offline.
        if (p === 1 && !q && data.total > PAGE_SIZE) {
          prefetchFullCatalog(bid, data.total);
        }
      } catch {
        if (controller.signal.aborted) return;
        const cached = await readCatalog(bid);
        if (cached) {
          const term = q.trim().toLowerCase();
          const filtered = term
            ? cached.items.filter(
                (i) =>
                  i.product_name.toLowerCase().includes(term) ||
                  i.variant_name.toLowerCase().includes(term) ||
                  i.sku.toLowerCase().includes(term) ||
                  (i.barcode ?? "").toLowerCase().includes(term),
              )
            : cached.items;
          setProducts(filtered.slice(0, PAGE_SIZE));
          setTotal(filtered.length);
          setFromCache(true);
          setCacheStale(cached.stale);
        } else {
          setProducts([]);
          setTotal(0);
          setFromCache(false);
        }
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    },
    [],
  );

  /** Silently fetch all remaining catalog pages and merge into the cache. */
  async function prefetchFullCatalog(bid: number, total: number) {
    const pages = Math.ceil(total / PAGE_SIZE);
    const allItems: VariantLookup[] = [];
    try {
      for (let pg = 1; pg <= pages; pg++) {
        const data = await api<Paginated<VariantLookup>>("/api/v1/pos/browse", {
          params: { branch_id: bid, q: "", page: pg, page_size: PAGE_SIZE },
        });
        allItems.push(...data.items);
      }
      if (allItems.length > 0) await cacheCatalog(bid, allItems);
    } catch {
      /* prefetch is best-effort, the partial cache is still useful */
    }
  }

  useEffect(() => {
    if (branchId === null) return;
    setPage(1);
    loadProducts(1, search, branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (branchId === null) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadProducts(1, search, branchId);
    }, 200);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, branchId, loadProducts]);

  useEffect(() => {
    if (branchId !== null && !search) loadProducts(page, "", branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Keyboard shortcuts for a fast counter: F2 search, F4 charge / pay, Esc back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); scanRef.current?.focus(); scanRef.current?.select(); }
      else if (e.key === "F4" && cart.length > 0) {
        e.preventDefault();
        if (!showCheckout) setShowCheckout(true); else completeSale();
      } else if (e.key === "Escape" && showCheckout && !heldOpen && !receipt) setShowCheckout(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* --------------------------------- totals -------------------------------- */
  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.unit_price * l.quantity, 0),
    [cart],
  );
  const discountNum = useMemo(() => Math.max(0, parseFloat(discount) || 0), [discount]);
  const net = useMemo(() => Math.max(0, subtotal - discountNum), [subtotal, discountNum]);

  const taxRate = config?.tax_rate ?? 0;
  const taxInclusive = config?.tax_inclusive ?? true;
  const tax = useMemo(() => {
    if (taxRate <= 0) return 0;
    return taxInclusive ? net - net / (1 + taxRate) : net * taxRate;
  }, [net, taxRate, taxInclusive]);
  const saleTotal = useMemo(
    () => (taxRate > 0 && !taxInclusive ? net + tax : net),
    [net, tax, taxRate, taxInclusive],
  );

  const tenderedNum = useMemo(() => parseFloat(amountTendered) || 0, [amountTendered]);
  const splitTotal = useMemo(
    () => splitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0),
    [splitLines],
  );
  const change = useMemo(
    () => (splitMode ? splitTotal - saleTotal : tenderedNum - saleTotal),
    [splitMode, splitTotal, tenderedNum, saleTotal],
  );

  /* --------------------------------- cart --------------------------------- */
  const addToCart = useCallback((item: VariantLookup) => {
    setError(null);
    let added = false;
    let addedName = "";
    setCart((prev) => {
      const existing = prev.find((l) => l.variant_id === item.variant_id);
      const available = parseFloat(item.available_quantity);
      if (existing) {
        if (existing.quantity + 1 > existing.available) {
          setError(`Only ${existing.available} ${item.unit} of ${item.product_name} in stock`);
          return prev;
        }
        added = true;
        addedName = item.product_name;
        return prev.map((l) =>
          l.variant_id === item.variant_id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      if (available < 1) {
        setError(`${item.product_name} - ${item.variant_name} is out of stock`);
        return prev;
      }
      added = true;
      addedName = item.product_name;
      return [
        ...prev,
        {
          variant_id: item.variant_id,
          product_name: item.product_name,
          variant_name: item.variant_name,
          sku: item.sku,
          unit: item.unit,
          unit_price: parseFloat(item.selling_price),
          quantity: 1,
          available,
        },
      ];
    });
    if (added) showToast(`${addedName} added to sale`);
  }, [showToast]);

  const setQty = useCallback((variantId: number, qty: number) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.variant_id !== variantId) return l;
        if (!qty || isNaN(qty)) return { ...l, quantity: 1 };
        return { ...l, quantity: Math.max(1, Math.min(qty, l.available)) };
      }),
    );
  }, []);

  const removeLine = useCallback((variantId: number) => {
    setCart((prev) => prev.filter((l) => l.variant_id !== variantId));
  }, []);

  function resetSale() {
    setCart([]);
    setDiscount("");
    setAmountTendered("");
    setCustomer(null);
    setCustomerQuery("");
    setAddCustomer(false);
    setShowCheckout(false);
    setSplitMode(false);
    setSplitLines([
      { method: "CASH", amount: "" },
      { method: "MOBILE_MONEY", amount: "" },
    ]);
  }

  /* ------------------------------ barcode scan ----------------------------- */
  async function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = search.trim();
    if (!code || branchId === null) return;
    const local = products.find((p) => p.barcode === code || p.sku === code);
    if (local) {
      addToCart(local);
      setSearch("");
      return;
    }
    if (!online) {
      showToast(`No product found for "${code}"`, "error");
      return;
    }
    try {
      const item = await api<VariantLookup>("/api/v1/pos/lookup", {
        params: { code, branch_id: branchId },
      });
      addToCart(item);
      setSearch("");
    } catch {
      showToast(`No product found for "${code}"`, "error");
    }
  }

  /* -------------------------------- customer ------------------------------- */
  function onCustomerQueryChange(q: string) {
    setCustomerQuery(q);
    if (custTimer.current) clearTimeout(custTimer.current);
    if (!q.trim() || !online) {
      setCustomerResults([]);
      return;
    }
    custTimer.current = setTimeout(async () => {
      try {
        setCustomerResults(await api<Customer[]>("/api/v1/customers", { params: { q } }));
      } catch {
        setCustomerResults([]);
      }
    }, 250);
  }

  async function createCustomerInline() {
    if (!newCustName.trim()) return;
    setNewCustBusy(true);
    try {
      const c = await api<Customer>("/api/v1/customers", {
        method: "POST",
        body: {
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          customer_type: "INDIVIDUAL",
        },
      });
      setCustomer(c);
      setShowNewCustomer(false);
      setNewCustName("");
      setNewCustPhone("");
      setCustomerQuery("");
      setCustomerResults([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create customer");
    } finally {
      setNewCustBusy(false);
    }
  }

  /* ------------------------------- held sales ------------------------------ */
  async function holdSale() {
    if (cart.length === 0) return;
    const cartPayload = { lines: cart, discount, customer_id: customer?.id ?? null };
    if (!online) {
      await holdSaleLocally({
        id: crypto.randomUUID(),
        label: customer?.name ?? `${cart.length} item(s)`,
        cart_data: cartPayload,
        held_at: new Date().toISOString(),
      });
      setNotice("Sale parked locally (offline)");
      resetSale();
      setTimeout(() => setNotice(null), 4000);
      return;
    }
    try {
      await api("/api/v1/sales/held", {
        method: "POST",
        body: { label: customer?.name ?? `${cart.length} item(s)`, cart_data: cartPayload },
      });
      setNotice("Sale parked successfully");
      resetSale();
      setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not park this sale");
    }
  }

  async function openHeld() {
    setHeldOpen(true);
    const localHeld = await readHeldSalesLocally();
    const localMapped = localHeld.map((h) => ({ id: h.id, label: h.label, cart_data: h.cart_data, offline: true }));
    if (!online) {
      setHeld(localMapped);
      return;
    }
    try {
      const serverHeld = await api<{ id: number; label: string | null; cart_data: unknown }[]>("/api/v1/sales/held/mine");
      setHeld([...localMapped, ...serverHeld]);
    } catch {
      setHeld(localMapped);
    }
  }

  function resumeHeld(h: { id: number | string; cart_data: unknown; offline?: boolean }) {
    const data = h.cart_data as { lines?: CartLine[]; discount?: string };
    if (data?.lines) setCart(data.lines);
    if (data?.discount) setDiscount(data.discount);
    setHeldOpen(false);
    if (h.offline) {
      removeHeldSaleLocally(String(h.id)).catch(() => {});
    } else {
      api(`/api/v1/sales/held/${h.id}`, { method: "DELETE" }).catch(() => {});
    }
  }

  /* ------------------------------ complete sale ---------------------------- */
  function buildPayments(): { method: string; amount: string }[] | undefined {
    if (!splitMode) return undefined;
    return splitLines
      .filter((l) => (parseFloat(l.amount) || 0) > 0)
      .map((l) => ({ method: l.method, amount: (parseFloat(l.amount) || 0).toFixed(2) }));
  }

  async function completeSale() {
    if (branchId === null || cart.length === 0 || busy) return;
    if (discountNum > subtotal) {
      setError("Discount cannot exceed subtotal");
      return;
    }
    if (splitMode) {
      if (splitTotal < saleTotal - 0.005) {
        setError(`Split payments (${cedi(splitTotal)}) do not cover the total (${cedi(saleTotal)})`);
        return;
      }
    } else if (payment === "CASH" && tenderedNum < saleTotal - 0.005) {
      setError(`Amount tendered (${cedi(tenderedNum)}) is less than total (${cedi(saleTotal)})`);
      return;
    }

    setBusy(true);
    setError(null);

    const transactionId = crypto.randomUUID();
    const payments = buildPayments();
    const body = {
      transaction_id: transactionId,
      branch_id: branchId,
      customer_id: customer?.id ?? null,
      items: cart.map((l) => ({ variant_id: l.variant_id, quantity: String(l.quantity) })),
      discount_amount: discountNum.toFixed(2),
      payment_method: splitMode ? (payments?.[0]?.method ?? "CASH") : payment,
      ...(payments && payments.length > 0 ? { payments } : {}),
    };

    if (!online) {
      await queueOffline(transactionId, body, payments);
      setBusy(false);
      return;
    }

    try {
      const sale = await api<Sale>("/api/v1/sales", { method: "POST", body });
      setReceipt(sale);
      resetSale();
      loadProducts(page, search, branchId);
      if (canShift) {
        api<Shift | null>("/api/v1/shifts/current")
          .then(setShift)
          .catch(() => {});
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        await queueOffline(transactionId, body, payments);
      } else {
        setError(err instanceof ApiError ? err.message : "Sale failed, please retry");
      }
    } finally {
      setBusy(false);
    }
  }

  async function queueOffline(
    transactionId: string,
    body: Record<string, unknown>,
    payments?: { method: string; amount: string }[],
  ) {
    const soldAt = new Date().toISOString();
    try {
      await enqueueSale({
        transaction_id: transactionId,
        branch_id: branchId as number,
        customer_id: customer?.id ?? null,
        items: body.items as { variant_id: number; quantity: string }[],
        discount_amount: discountNum.toFixed(2),
        payment_method: body.payment_method as string,
        payments,
        is_offline: true,
        sold_at: soldAt,
        local: {
          lines: cart.map((l) => ({
            product_name: l.product_name,
            variant_name: l.variant_name,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
          total: saleTotal,
          customer_name: customer?.name ?? null,
          customer_phone: customer?.phone ?? null,
        },
        queued_at: soldAt,
        attempts: 0,
      });

      setReceipt({
        offline: true,
        transaction_id: transactionId,
        sold_at: soldAt,
        lines: cart.map((l) => ({
          product_name: l.product_name,
          variant_name: l.variant_name,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
        subtotal,
        discount: discountNum,
        tax,
        total: saleTotal,
        payment_method: body.payment_method as string,
        customer_name: customer?.name ?? null,
        customer_phone: customer?.phone ?? null,
        change: Math.max(0, change),
      });
      resetSale();
    } catch {
      setError("Could not save this sale. Please write it down and retry.");
    }
  }

  /* -------------------------------- render -------------------------------- */
  if (branchId === null) {
    if (!branchesLoaded) return <div className="flex h-screen items-center justify-center text-txt-secondary">Loading...</div>;
    if (branches.length === 0)
      return (
        <div className="flex h-screen items-center justify-center p-8 text-txt-secondary">
          No branches configured. Contact administrator.
        </div>
      );
    return (
      <div className="flex h-screen items-center justify-center bg-appbg p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
          <h2 className="mb-2 text-xl font-bold text-txt-primary">Select Branch</h2>
          <p className="mb-6 text-sm text-txt-secondary">Choose which branch you are operating from</p>
          <select
            value=""
            onChange={(e) => setBranchId(Number(e.target.value))}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-txt-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="" disabled>
              Select branch...
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#F4F5F9]">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 14h3" /></svg>
          </div>
          <div>
            <h1 className="text-lg font-extrabold leading-tight tracking-tight text-txt-primary">Point of Sale</h1>
            <p className="text-xs font-medium text-txt-secondary">{cart.length} {cart.length === 1 ? "item" : "items"} in the order</p>
          </div>
          {!online && <span className="rounded-md bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">Offline mode</span>}
          {fromCache && online && (
            <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${cacheStale ? "bg-warning/10 text-warning" : "bg-[#EDEFF9] text-txt-secondary"}`}>
              {cacheStale ? "Saved data, may be old" : "Saved data"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canShift && shift && (
            <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3.5 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              <span className="text-sm font-bold text-success">Drawer open · {cedi(parseFloat(shift.cash_taken) || 0)}</span>
            </div>
          )}
          {canShift && !shift && (
            <Link href="/shifts" className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2 text-sm font-bold text-warning hover:bg-warning/20">Open drawer</Link>
          )}
          {canHold && (
            <button onClick={openHeld} className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-txt-primary hover:bg-[#F4F5F9]">Parked sales</button>
          )}
          <Link href={`/sales/today?branch=${branchId}`} className="rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-txt-primary hover:bg-[#F4F5F9]">Today&apos;s sales</Link>
        </div>
      </header>

      {notice && (
        <div className="border-b border-success/20 bg-success/10 px-5 py-2.5">
          <p className="text-sm font-semibold text-success">{notice}</p>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ---------------- Products ---------------- */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border bg-white px-5 py-4">
            <form onSubmit={onScanSubmit} className="relative">
              <IconSearch className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-txt-light" />
              <input
                ref={scanRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                placeholder="Scan a barcode or search by name or SKU (F2)"
                className="w-full rounded-lg border-2 border-border bg-white py-3 pl-12 pr-12 text-[15px] font-medium text-txt-primary placeholder:font-normal placeholder:text-txt-light focus:border-primary focus:outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-txt-light hover:text-txt-primary">
                  <IconX className="h-5 w-5" />
                </button>
              )}
            </form>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {catalogLoading && products.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-border bg-white">
                    <div className="aspect-[4/3] animate-pulse bg-[#EDEFF9]" />
                    <div className="space-y-2 p-3"><div className="h-4 w-3/4 animate-pulse rounded bg-[#EDEFF9]" /><div className="h-4 w-1/3 animate-pulse rounded bg-[#EDEFF9]" /></div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-txt-light">
                <svg className="h-14 w-14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                <p className="text-sm font-semibold">{search ? "No products match your search" : "No products available"}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {products.map((p) => {
                  const inCart = cart.find((l) => l.variant_id === p.variant_id);
                  const stock = parseFloat(p.available_quantity);
                  const out = stock < 1;
                  return (
                    <button
                      key={p.variant_id}
                      onClick={() => addToCart(p)}
                      disabled={out}
                      className={`group relative flex flex-col overflow-hidden rounded-xl border-2 bg-white text-left transition ${
                        inCart ? "border-primary shadow-md" : "border-transparent shadow-sm hover:border-[#C9CDEB] hover:shadow-md"
                      } ${out ? "cursor-not-allowed opacity-50" : "active:scale-[0.98]"}`}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-border bg-[#F4F5F9]">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.image_url}
                            alt={p.product_name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[#B9BDD0]">
                            <svg className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" /></svg>
                          </div>
                        )}
                        {inCart && <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-extrabold text-white shadow">{inCart.quantity}</span>}
                        {out ? (
                          <span className="absolute left-2 top-2 rounded-md bg-danger px-2 py-0.5 text-[11px] font-bold text-white">Out of stock</span>
                        ) : stock <= 5 ? (
                          <span className="absolute left-2 top-2 rounded-md bg-warning px-2 py-0.5 text-[11px] font-bold text-white">{stock} left</span>
                        ) : null}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 p-3">
                        <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-txt-primary">{p.product_name}</h3>
                        <p className="truncate text-xs font-medium text-txt-secondary">{p.variant_name}</p>
                        <div className="mt-auto flex items-end justify-between pt-2">
                          <span className="text-[17px] font-extrabold tabular-nums text-primary">{cedi(parseFloat(p.selling_price))}</span>
                          <span className="text-[11px] font-medium text-txt-light">{stock} {p.unit}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!fromCache && total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border bg-white px-5 py-3">
              <span className="text-sm font-medium text-txt-secondary">Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <Pagination className="mt-0" page={page} pages={totalPages} onPage={setPage} />
            </div>
          )}
        </section>

        {/* ---------------- Order ---------------- */}
        <aside className="flex max-h-[55vh] w-full shrink-0 flex-col border-t border-border bg-white lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0 xl:w-[440px]">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-lg font-extrabold tracking-tight text-txt-primary">Current order</h2>
            <div className="flex items-center gap-3">
              {canHold && cart.length > 0 && <button onClick={holdSale} className="text-sm font-bold text-primary hover:underline">Park</button>}
              {cart.length > 0 && <button onClick={resetSale} className="text-sm font-bold text-danger hover:underline">Clear all</button>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-2 p-6 text-center text-txt-light">
                <svg className="h-16 w-16" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" /></svg>
                <p className="text-sm font-bold text-txt-secondary">No items yet</p>
                <p className="text-xs">Tap a product or scan a barcode to add it.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l) => (
                  <li key={l.variant_id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[14px] font-bold leading-snug text-txt-primary">{l.product_name}</p>
                        <p className="text-xs font-medium text-txt-secondary">{l.variant_name} · {cedi(l.unit_price)} each</p>
                      </div>
                      <p className="shrink-0 text-[15px] font-extrabold tabular-nums text-txt-primary">{cedi(l.unit_price * l.quantity)}</p>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex items-center overflow-hidden rounded-lg border-2 border-border">
                        <button onClick={() => setQty(l.variant_id, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="Decrease" className="flex h-9 w-9 items-center justify-center text-txt-primary hover:bg-[#F4F5F9] disabled:opacity-30">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={l.available}
                          value={l.quantity}
                          onChange={(e) => setQty(l.variant_id, parseInt(e.target.value) || 0)}
                          aria-label="Quantity"
                          className="h-9 w-12 border-x-2 border-border bg-white text-center text-sm font-extrabold text-txt-primary focus:outline-none"
                        />
                        <button onClick={() => setQty(l.variant_id, l.quantity + 1)} disabled={l.quantity >= l.available} aria-label="Increase" className="flex h-9 w-9 items-center justify-center text-txt-primary hover:bg-[#F4F5F9] disabled:opacity-30">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                        </button>
                      </div>
                      <button onClick={() => removeLine(l.variant_id)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-txt-secondary hover:bg-danger/10 hover:text-danger">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger" role="alert">{error}</div>
          )}

          {cart.length > 0 && (
            <div className="border-t-2 border-border bg-white px-5 py-4">
              {!showCheckout ? (
                <>
                  <dl className="mb-4 space-y-1.5 text-sm">
                    <div className="flex justify-between text-txt-secondary"><dt>Subtotal</dt><dd className="font-semibold tabular-nums text-txt-primary">{cedi(subtotal)}</dd></div>
                    {discountNum > 0 && <div className="flex justify-between text-txt-secondary"><dt>Discount</dt><dd className="font-semibold tabular-nums text-success">-{cedi(discountNum)}</dd></div>}
                    {taxRate > 0 && <div className="flex justify-between text-txt-secondary"><dt>Tax ({(taxRate * 100).toFixed(1)}%{taxInclusive ? " included" : ""})</dt><dd className="font-semibold tabular-nums text-txt-primary">{cedi(tax)}</dd></div>}
                    <div className="flex items-baseline justify-between border-t border-border pt-3">
                      <dt className="text-base font-bold text-txt-primary">Total</dt>
                      <dd className="text-[28px] font-extrabold tabular-nums leading-none text-primary">{cedi(saleTotal)}</dd>
                    </div>
                  </dl>
                  <button onClick={() => setShowCheckout(true)} className="w-full rounded-lg bg-primary py-4 text-base font-extrabold text-white shadow-sm transition hover:bg-primary-hover active:scale-[0.99]">
                    Charge {cedi(saleTotal)} <span className="ml-1 text-xs font-semibold opacity-70">F4</span>
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className={splitMode ? "hidden" : ""}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-txt-secondary">Payment method</p>
                    <div className="grid grid-cols-2 gap-2">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.val}
                          type="button"
                          onClick={() => setPayment(m.val)}
                          aria-pressed={payment === m.val}
                          className={`rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition ${payment === m.val ? "border-primary bg-primary text-white" : "border-border bg-white text-txt-primary hover:border-[#C9CDEB]"}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-txt-primary">
                    <input type="checkbox" checked={splitMode} onChange={(e) => setSplitMode(e.target.checked)} className="h-4 w-4" />
                    Split between payment methods
                  </label>
                  {splitMode && (
                    <div className="space-y-2 rounded-lg border border-border bg-[#F4F5F9] p-3">
                      {splitLines.map((l, i) => (
                        <div key={i} className="flex gap-2">
                          <select value={l.method} onChange={(e) => setSplitLines(splitLines.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))} className="w-40 rounded-lg border-2 border-border bg-white px-2 py-2 text-sm font-semibold">
                            {PAYMENT_METHODS.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
                          </select>
                          <input type="number" min={0} step="0.01" value={l.amount} placeholder="0.00" onChange={(e) => setSplitLines(splitLines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border-2 border-border bg-white px-3 py-2 text-sm font-bold tabular-nums" />
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs font-bold">
                        <button type="button" onClick={() => setSplitLines([...splitLines, { method: "CASH", amount: "" }])} className="text-primary hover:underline">+ Add method</button>
                        <span className={splitTotal >= saleTotal - 0.005 ? "text-success" : "text-danger"}>{splitTotal >= saleTotal - 0.005 ? `Change due ${cedi(splitTotal - saleTotal)}` : `Still owing ${cedi(saleTotal - splitTotal)}`}</span>
                      </div>
                    </div>
                  )}

                  {canDiscount && (
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-txt-secondary">Discount (₵)</label>
                      <input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00"
                        className="w-full rounded-lg border-2 border-border bg-white px-4 py-2.5 text-[15px] font-semibold text-txt-primary placeholder:font-normal placeholder:text-txt-light focus:border-primary focus:outline-none" />
                    </div>
                  )}

                  {payment === "CASH" && !splitMode && (
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-txt-secondary">Cash received (₵)</label>
                      <input type="number" min={0} step="0.01" value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)} placeholder="0.00"
                        className="w-full rounded-lg border-2 border-border bg-white px-4 py-2.5 text-lg font-extrabold tabular-nums text-txt-primary placeholder:font-normal placeholder:text-txt-light focus:border-primary focus:outline-none" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => setAmountTendered(saleTotal.toFixed(2))} className="rounded-md border border-border px-2.5 py-1 text-xs font-bold text-primary hover:bg-[#EDEFF9]">Exact</button>
                        {[10, 20, 50, 100, 200].map((n) => (
                          <button key={n} type="button" onClick={() => setAmountTendered(String(n))} className="rounded-md border border-border px-2.5 py-1 text-xs font-bold text-txt-primary hover:bg-[#EDEFF9]">₵{n}</button>
                        ))}
                      </div>
                      {tenderedNum > 0 && (
                        <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-extrabold ${change >= 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                          {change >= 0 ? `Change due: ${cedi(change)}` : `Still owing: ${cedi(-change)}`}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-txt-primary">
                      <input
                        type="checkbox"
                        checked={addCustomer}
                        onChange={(e) => {
                          setAddCustomer(e.target.checked);
                          if (!e.target.checked) { setCustomer(null); setCustomerQuery(""); setShowNewCustomer(false); }
                        }}
                        className="h-4 w-4"
                      />
                      Attach a customer
                    </label>

                    {addCustomer && (
                      <div className="mt-2 space-y-2">
                        {customer ? (
                          <div className="flex items-center justify-between rounded-lg border-2 border-primary bg-primary/5 px-4 py-2.5">
                            <div><p className="font-bold text-txt-primary">{customer.name}</p>{customer.phone && <p className="text-xs text-txt-secondary">{customer.phone}</p>}</div>
                            <button onClick={() => setCustomer(null)} aria-label="Remove customer" className="text-txt-light hover:text-danger"><IconX className="h-5 w-5" /></button>
                          </div>
                        ) : showNewCustomer ? (
                          <div className="space-y-2 rounded-lg border border-border bg-[#F4F5F9] p-3">
                            <input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Customer name *" className="w-full rounded-lg border-2 border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                            <input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="Phone (optional)" className="w-full rounded-lg border-2 border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                            <div className="flex gap-2">
                              <button onClick={createCustomerInline} disabled={newCustBusy || !newCustName.trim()} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">{newCustBusy ? "Saving…" : "Save customer"}</button>
                              <button onClick={() => setShowNewCustomer(false)} className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-bold text-txt-primary hover:bg-[#EDEFF9]">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <input value={customerQuery} onChange={(e) => onCustomerQueryChange(e.target.value)} placeholder="Search customer by name or phone" disabled={!online}
                              className="w-full rounded-lg border-2 border-border bg-white px-4 py-2.5 text-sm text-txt-primary placeholder:text-txt-light focus:border-primary focus:outline-none disabled:opacity-50" />
                            {customerResults.length > 0 && (
                              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-white shadow-lg">
                                {customerResults.map((c) => (
                                  <li key={c.id}>
                                    <button onClick={() => { setCustomer(c); setCustomerResults([]); setCustomerQuery(""); }} className="block w-full px-4 py-2.5 text-left text-sm font-medium text-txt-primary hover:bg-primary/5">
                                      {c.name}{c.phone && <span className="text-txt-light"> · {c.phone}</span>}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {online && <button onClick={() => setShowNewCustomer(true)} className="mt-2 text-sm font-bold text-primary hover:underline">+ New customer</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowCheckout(false)} className="flex-1 rounded-lg border-2 border-border py-3 text-sm font-bold text-txt-primary hover:bg-[#F4F5F9]">Back</button>
                    <button onClick={completeSale} disabled={busy} className="flex-[2] rounded-lg bg-success py-3 text-base font-extrabold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                      {busy ? "Processing…" : online ? `Complete sale · ${cedi(saleTotal)}` : "Save offline"}
                    </button>
                  </div>
                  {!online && <p className="text-center text-xs text-txt-light">It will upload when the connection returns.</p>}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Held Sales Modal */}
      {heldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-txt-primary">Parked Sales</h2>
              <button onClick={() => setHeldOpen(false)} className="text-txt-light hover:text-txt-secondary">
                <IconX className="h-6 w-6" />
              </button>
            </div>
            {held.length === 0 ? (
              <p className="py-12 text-center text-sm text-txt-light">No parked sales</p>
            ) : (
              <ul className="space-y-2">
                {held.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => resumeHeld(h)}
                      className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left hover:border-primary hover:bg-primary/5"
                    >
                      <span className="font-semibold text-txt-primary">{h.label ?? `Sale #${h.id}`}</span>
                      <span className="text-sm font-semibold text-primary">Resume →</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <ReceiptModal
          receipt={receipt}
          companyName={config?.company_name ?? "MJ Electricals Ghana Limited"}
          company={config ?? null}
          onClose={() => {
            setReceipt(null);
            setAmountTendered("");
            scanRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------- receipt -------------------------------- */
function ReceiptModal({
  receipt,
  companyName,
  company,
  onClose,
}: {
  receipt: Sale | OfflineReceipt;
  companyName: string;
  company: PosConfig | null;
  onClose: () => void;
}) {
  const isOffline = "offline" in receipt;

  const lines = isOffline
    ? receipt.lines.map((l, i) => ({
        key: String(i),
        name: `${l.product_name} - ${l.variant_name}`,
        qty: l.quantity,
        unit: l.unit_price.toFixed(2),
        lineTotal: (l.quantity * l.unit_price).toFixed(2),
      }))
    : receipt.items.map((i) => ({
        key: String(i.id),
        name: `${i.product_name} - ${i.variant_name}`,
        qty: parseFloat(i.quantity),
        unit: i.unit_price,
        lineTotal: i.line_total,
      }));

  const ref = isOffline ? `OFFLINE-${receipt.transaction_id.slice(0, 8)}` : receipt.receipt_number;
  const soldAt = isOffline ? receipt.sold_at : receipt.sold_at;
  const subtotal = isOffline ? receipt.subtotal.toFixed(2) : receipt.subtotal;
  const discount = isOffline ? receipt.discount.toFixed(2) : receipt.discount_amount;
  const taxAmount = isOffline ? receipt.tax.toFixed(2) : (receipt.tax_amount ?? "0");
  const totalStr = isOffline ? receipt.total.toFixed(2) : receipt.total;
  const method = isOffline ? receipt.payment_method : receipt.payment_method;
  const custName = isOffline ? receipt.customer_name : receipt.customer_name;
  const custPhone = isOffline ? receipt.customer_phone : receipt.customer_phone;
  const changeDue = isOffline ? receipt.change : 0;
  const payments = !isOffline ? (receipt.payments ?? []) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="receipt-print max-h-[92vh] w-full max-w-md overflow-auto rounded-xl bg-white p-8 shadow-2xl">
        <div className="text-center">
          <div className="mb-1 text-2xl font-bold text-primary">{companyName}</div>
          {company?.company_address && <div className="text-xs text-txt-light">{company.company_address}</div>}
          {(company?.company_phone || company?.company_email) && (
            <div className="text-xs text-txt-light">{[company?.company_phone, company?.company_email].filter(Boolean).join(" · ")}</div>
          )}
          {company?.company_tin && <div className="text-xs text-txt-light">TIN: {company.company_tin}</div>}
          <div className="mt-2 text-sm text-txt-light">Receipt {ref}</div>
          <div className="text-xs text-txt-light">{new Date(soldAt).toLocaleString()}</div>
          {isOffline && (
            <div className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">
              Captured Offline
            </div>
          )}
          {custName && (
            <div className="mt-2 text-sm text-txt-secondary">
              Customer: {custName}
              {custPhone && ` · ${custPhone}`}
            </div>
          )}
        </div>

        <div className="my-6 border-t-2 border-dashed border-border" />

        <table className="w-full text-sm">
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-border last:border-0">
                <td className="py-3">
                  <div className="font-semibold text-txt-primary">{l.name}</div>
                  <div className="text-xs text-txt-light">
                    {l.qty} × ₵ {l.unit}
                  </div>
                </td>
                <td className="py-3 text-right font-semibold text-txt-primary">₵ {l.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-6 border-t-2 border-dashed border-border" />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-txt-secondary">
            <span>Subtotal</span>
            <span>₵ {subtotal}</span>
          </div>
          {parseFloat(discount) > 0 && (
            <div className="flex justify-between text-txt-secondary">
              <span>Discount</span>
              <span className="text-primary font-semibold">-₵ {discount}</span>
            </div>
          )}
          {parseFloat(taxAmount) > 0 && (
            <div className="flex justify-between text-txt-secondary">
              <span>Tax</span>
              <span>₵ {taxAmount}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-xl font-bold text-txt-primary">
            <span>Total</span>
            <span className="text-primary">₵ {totalStr}</span>
          </div>
        </div>

        {payments.length > 1 ? (
          <div className="mt-4 space-y-1 text-sm text-txt-secondary">
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{p.method.replace(/_/g, " ")}</span>
                <span>₵ {p.amount}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-center text-sm text-txt-light">
            Paid by {method.replace(/_/g, " ")}
          </div>
        )}

        {changeDue > 0 && (
          <div className="mt-3 text-center text-base font-bold text-success">
            Change: ₵ {changeDue.toFixed(2)}
          </div>
        )}

        <div className="my-6 border-t-2 border-dashed border-border" />

        <div className="text-center text-xs text-txt-light">
          <p>{company?.receipt_footer || "Thank you for your purchase!"}</p>
          <p className="mt-1">Please visit us again</p>
        </div>

        <div className="no-print mt-6 flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-3 font-semibold text-txt-primary hover:bg-[#FAFAFC]"
          >
            <IconPrint className="h-5 w-5" />
            Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-primary py-3 font-bold text-white hover:bg-primary-hover"
          >
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}
