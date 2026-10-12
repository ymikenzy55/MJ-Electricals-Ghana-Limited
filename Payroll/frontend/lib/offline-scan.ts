"use client";

import { api, ApiError } from "@/lib/api";
import { getWorkerToken, getWorkerProfile } from "@/lib/worker";

/**
 * Scans made with no signal are kept on the phone and sent as soon as it is
 * back online. The scan keeps the moment it was made, and the server accepts
 * it only if the QR code and the location check out, and marks it for review.
 */

const QUEUE_KEY = "mj_scan_queue";
const HOME_KEY = "mj_worker_home_cache";
const DONE_KEY = "mj_scan_sync_results";

export interface QueuedScan {
  id: string;
  employee_id: number;
  code: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  device_id: string;
  client_time: string;
}
export interface SyncResult { id: string; at: string; ok: boolean; message: string }

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } }

export const readScanQueue = (): QueuedScan[] => read<QueuedScan[]>(QUEUE_KEY, []);
export const readSyncResults = (): SyncResult[] => read<SyncResult[]>(DONE_KEY, []);
export const clearSyncResults = () => write(DONE_KEY, []);

export function queueScan(s: Omit<QueuedScan, "id" | "client_time" | "employee_id">): QueuedScan | null {
  const me = getWorkerProfile();
  if (!me) return null;
  const item: QueuedScan = { ...s, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, client_time: new Date().toISOString(), employee_id: me.id };
  write(QUEUE_KEY, [...readScanQueue(), item]);
  window.dispatchEvent(new Event("mj:scan-queue"));
  return item;
}

export const saveHomeCache = (data: unknown) => write(HOME_KEY, { at: Date.now(), data });
export const readHomeCache = <T,>(): { at: number; data: T } | null => read<{ at: number; data: T } | null>(HOME_KEY, null);

export function isNetworkError(e: unknown): boolean {
  return !(e instanceof ApiError);
}

let flushing = false;

/** Send queued scans, oldest first. Returns how many were handled. */
export async function flushScanQueue(): Promise<number> {
  const token = getWorkerToken();
  const me = getWorkerProfile();
  if (flushing || !token || !me || typeof navigator === "undefined" || !navigator.onLine) return 0;
  flushing = true;
  let handled = 0;
  try {
    const queue = readScanQueue().sort((a, b) => a.client_time.localeCompare(b.client_time));
    for (const item of queue) {
      if (item.employee_id !== me.id) continue; // belongs to someone else on this phone
      try {
        const r = await api.workerScan(token, { code: item.code, lat: item.lat, lng: item.lng, accuracy: item.accuracy, device_id: item.device_id, client_time: item.client_time });
        record(item, true, r.message);
      } catch (e) {
        if (isNetworkError(e)) break; // still offline, try later
        if (e instanceof ApiError && e.status === 401) break;
        if (e instanceof ApiError && e.status === 429) break;
        record(item, false, e instanceof Error ? e.message : "Not accepted");
      }
      write(QUEUE_KEY, readScanQueue().filter((q) => q.id !== item.id));
      handled++;
    }
  } finally {
    flushing = false;
    window.dispatchEvent(new Event("mj:scan-queue"));
  }
  return handled;
}

function record(item: QueuedScan, ok: boolean, message: string) {
  const list = readSyncResults();
  list.unshift({ id: item.id, at: item.client_time, ok, message });
  write(DONE_KEY, list.slice(0, 10));
}
