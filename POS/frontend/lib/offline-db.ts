/**
 * Offline storage for the POS terminal.
 *
 * Two object stores:
 *  - `catalog`  cached product/stock rows so the cashier can keep selling
 *               and searching when the network drops.
 *  - `queue`    sales captured offline, keyed by their client-generated
 *               transaction_id. The server treats transaction_id as an
 *               idempotency key, so replaying the queue is always safe.
 */

import type { QueuedSale, VariantLookup } from "./types";

const DB_NAME = "mj_pos_offline";
const DB_VERSION = 1;
const CATALOG_STORE = "catalog";
const QUEUE_STORE = "queue";
const META_STORE = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "transaction_id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/* ------------------------------ catalog cache ----------------------------- */

/** Cache the full variant list for a branch so offline search still works. */
export async function cacheCatalog(branchId: number, items: VariantLookup[]): Promise<void> {
  try {
    await tx(CATALOG_STORE, "readwrite", (s) =>
      s.put({ key: `branch_${branchId}`, items, cached_at: new Date().toISOString() }),
    );
  } catch {
    /* cache is best-effort */
  }
}

const CATALOG_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function readCatalog(
  branchId: number,
): Promise<{ items: VariantLookup[]; cached_at: string; stale: boolean } | null> {
  try {
    const row = await tx<{ items: VariantLookup[]; cached_at: string } | undefined>(
      CATALOG_STORE,
      "readonly",
      (s) => s.get(`branch_${branchId}`),
    );
    if (!row) return null;
    const stale = Date.now() - new Date(row.cached_at).getTime() > CATALOG_TTL_MS;
    return { ...row, stale };
  } catch {
    return null;
  }
}

/* ------------------------------- sale queue ------------------------------- */

export async function enqueueSale(sale: QueuedSale): Promise<void> {
  await tx(QUEUE_STORE, "readwrite", (s) => s.put(sale));
}

export async function readQueue(): Promise<QueuedSale[]> {
  try {
    const all = await tx<QueuedSale[]>(QUEUE_STORE, "readonly", (s) => s.getAll());
    return (all ?? []).sort((a, b) => a.queued_at.localeCompare(b.queued_at));
  } catch {
    return [];
  }
}

export async function queueCount(): Promise<number> {
  try {
    return await tx<number>(QUEUE_STORE, "readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

export async function removeFromQueue(transactionId: string): Promise<void> {
  try {
    await tx(QUEUE_STORE, "readwrite", (s) => s.delete(transactionId));
  } catch {
    /* ignore */
  }
}

export async function markQueueError(transactionId: string, error: string): Promise<void> {
  try {
    const existing = await tx<QueuedSale | undefined>(QUEUE_STORE, "readonly", (s) =>
      s.get(transactionId),
    );
    if (!existing) return;
    await tx(QUEUE_STORE, "readwrite", (s) =>
      s.put({ ...existing, attempts: (existing.attempts ?? 0) + 1, last_error: error }),
    );
  } catch {
    /* ignore */
  }
}

/* ------------------------------- held sales (offline fallback) ------------ */

export interface HeldSaleLocal {
  id: string; // client-generated UUID
  label: string | null;
  cart_data: unknown;
  held_at: string;
}

export async function holdSaleLocally(entry: HeldSaleLocal): Promise<void> {
  await tx(QUEUE_STORE + "_held", "readwrite", (s) => s.put(entry)).catch(() => {
    // fallback: use a separate key in META_STORE
    return tx(META_STORE, "readwrite", (s) =>
      s.put({ key: `held_${entry.id}`, value: entry }),
    );
  });
}

export async function readHeldSalesLocally(): Promise<HeldSaleLocal[]> {
  try {
    const all = await tx<{ key: string; value: HeldSaleLocal }[]>(
      META_STORE,
      "readonly",
      (s) => s.getAll(),
    );
    return (all ?? [])
      .filter((r) => r.key.startsWith("held_"))
      .map((r) => r.value)
      .sort((a, b) => a.held_at.localeCompare(b.held_at));
  } catch {
    return [];
  }
}

export async function removeHeldSaleLocally(id: string): Promise<void> {
  try {
    await tx(META_STORE, "readwrite", (s) => s.delete(`held_${id}`));
  } catch {
    /* ignore */
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  try {
    await tx(META_STORE, "readwrite", (s) => s.put({ key, value }));
  } catch {
    /* ignore */
  }
}

export async function getMeta<T>(key: string): Promise<T | null> {
  try {
    const row = await tx<{ value: T } | undefined>(META_STORE, "readonly", (s) => s.get(key));
    return row ? row.value : null;
  } catch {
    return null;
  }
}
