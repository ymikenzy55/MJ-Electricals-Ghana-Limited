"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { api } from "./api";
import { markQueueError, queueCount, readQueue, removeFromQueue } from "./offline-db";

const MAX_ATTEMPTS = 5; // Fix #6: dead-letter threshold
import type { QueuedSale } from "./types";

interface SyncResult {
  transaction_id: string;
  status: "synced" | "duplicate" | "failed";
  receipt_number?: string | null;
  detail?: string;
}

interface ServerSyncStatus {
  mode: "local" | "cloud";
  online: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  pending: number;
  device?: string;
  data_version?: number;
}

interface OfflineState {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastSyncAt: string | null;
  lastSyncMessage: string | null;
  /** Backend sync-engine status, only set when the backend runs in local mode. */
  serverSync: ServerSyncStatus | null;
  /** Increases whenever synced data changed (other till, website order …). */
  dataVersion: number;
  /** Re-read the queue length from IndexedDB. */
  refresh: () => Promise<void>;
  /** Push any queued sales to the server. */
  sync: () => Promise<void>;
  /** Ask the backend sync engine to run a cycle now. */
  syncNow: () => Promise<void>;
}

const OfflineContext = createContext<OfflineState>({
  online: true,
  pending: 0,
  syncing: false,
  lastSyncAt: null,
  lastSyncMessage: null,
  serverSync: null,
  dataVersion: 0,
  refresh: async () => {},
  sync: async () => {},
  syncNow: async () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);
  const [serverSync, setServerSync] = useState<ServerSyncStatus | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    setPending(await queueCount());
  }, []);

  // Poll the backend sync engine. In cloud mode the endpoint does not exist
  // (404) and serverSync stays null, so nothing is shown.
  const pollServerSync = useCallback(async () => {
    try {
      const status = await api<ServerSyncStatus>("/api/v1/sync/status");
      setServerSync(status.mode === "local" ? status : null);
    } catch {
      setServerSync(null);
    }
  }, []);

  const syncNow = useCallback(async () => {
    try {
      await api("/api/v1/sync/run", { method: "POST" });
    } catch {
      /* surfaced via the next status poll */
    }
    await pollServerSync();
  }, [pollServerSync]);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = await readQueue();
    if (queue.length === 0) {
      setPending(0);
      return;
    }
    // Register a Background Sync tag so the browser can retry even if the
    // tab is closed before the upload completes.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if ("sync" in reg) return (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register("sync-sales");
        })
        .catch(() => {});
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      // Strip local-only display fields before sending.
      const payload = queue.map((q: QueuedSale) => ({
        transaction_id: q.transaction_id,
        branch_id: q.branch_id,
        customer_id: q.customer_id,
        items: q.items,
        discount_amount: q.discount_amount,
        payment_method: q.payment_method,
        ...(q.payments ? { payments: q.payments } : {}),
        is_offline: true,
        sold_at: q.sold_at,
      }));

      const res = await api<{
        synced: number;
        duplicates: number;
        failed: number;
        results: SyncResult[];
      }>("/api/v1/sales/sync", { method: "POST", body: payload });

      for (const r of res.results) {
        if (r.status === "synced" || r.status === "duplicate") {
          await removeFromQueue(r.transaction_id);
        } else {
          await markQueueError(r.transaction_id, r.detail ?? "Sync failed");
        }
      }

      // Fix #6: quarantine entries that have exceeded the retry limit so
      // they never block the rest of the queue. Move them to a dead-letter
      // key in meta so the manager can inspect them.
      const remaining = await readQueue();
      for (const q of remaining) {
        if ((q.attempts ?? 0) >= MAX_ATTEMPTS) {
          await removeFromQueue(q.transaction_id);
          try {
            const { setMeta, getMeta } = await import("./offline-db");
            const dead = (await getMeta<typeof remaining>("dead_letter")) ?? [];
            await setMeta("dead_letter", [...dead, { ...q, dead_at: new Date().toISOString() }]);
          } catch { /* best-effort */ }
        }
      }

      const parts: string[] = [];
      if (res.synced) parts.push(`${res.synced} uploaded`);
      if (res.duplicates) parts.push(`${res.duplicates} already on server`);
      if (res.failed) parts.push(`${res.failed} need attention`);
      setLastSyncMessage(parts.join(", ") || "Nothing to sync");
      setLastSyncAt(new Date().toISOString());
    } catch {
      setLastSyncMessage("Could not reach the server. Will retry.");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  // Track connectivity and auto-sync when the connection returns.
  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();

    function goOnline() {
      setOnline(true);
      sync();
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Opportunistic sync on load if we start online with a backlog.
    if (navigator.onLine) sync();

    // Retry periodically while there is a backlog.
    const timer = setInterval(() => {
      if (navigator.onLine) sync();
    }, 60_000);

    // Backend sync-engine status, poll on load and keep it fresh.
    pollServerSync();
    const statusTimer = setInterval(pollServerSync, 5_000);

    // Fix #4: listen for the service worker Background Sync wake-up message.
    function onSwMessage(event: MessageEvent) {
      if (event.data === "sync-sales") sync();
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
      clearInterval(statusTimer);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [refresh, sync, pollServerSync]);

  return (
    <OfflineContext.Provider
      value={{
        online,
        pending,
        syncing,
        lastSyncAt,
        lastSyncMessage,
        serverSync,
        dataVersion: serverSync?.data_version ?? 0,
        refresh,
        sync,
        syncNow,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineState {
  return useContext(OfflineContext);
}
