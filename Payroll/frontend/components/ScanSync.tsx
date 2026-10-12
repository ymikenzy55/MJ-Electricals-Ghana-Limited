"use client";

import { useCallback, useEffect, useState } from "react";
import { clearSyncResults, flushScanQueue, readScanQueue, readSyncResults, type SyncResult } from "@/lib/offline-scan";

/** Keeps offline scans moving and tells the worker what is waiting or was decided. */
export default function ScanSync() {
  const [pending, setPending] = useState(0);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(() => { setPending(readScanQueue().length); setResults(readSyncResults()); }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const tryFlush = () => { flushScanQueue().then(refresh); };
    const goOnline = () => { setOnline(true); tryFlush(); };
    const goOffline = () => setOnline(false);
    tryFlush();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("mj:scan-queue", refresh);
    const id = setInterval(() => { if (readScanQueue().length) tryFlush(); }, 20000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("mj:scan-queue", refresh);
      clearInterval(id);
    };
  }, [refresh]);

  if (online && pending === 0 && results.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-md space-y-2 px-4 pt-3" role="status">
      {!online && <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">You&apos;re offline. You can still scan. Your scans are saved and sent when the signal returns.</p>}
      {pending > 0 && <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{pending} scan{pending > 1 ? "s" : ""} saved on this phone, waiting to be sent.</p>}
      {results.map((r) => (
        <p key={r.id} className={`rounded-lg px-3 py-2 text-xs font-semibold ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          Offline scan from {new Date(r.at).toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" })}: {r.ok ? "recorded." : `not accepted. ${r.message}`}
        </p>
      ))}
      {results.length > 0 && <button onClick={() => { clearSyncResults(); refresh(); }} className="text-xs font-semibold text-[#061161]">Dismiss</button>}
    </div>
  );
}
