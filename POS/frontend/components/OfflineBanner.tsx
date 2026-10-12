"use client";

import { useOffline } from "@/lib/offline-context";

/**
 * Persistent connectivity strip.
 *
 * In local (offline-first) mode it reflects the backend sync engine —
 * whether the cloud database is reachable and how many local changes are
 * still waiting to upload. In cloud mode it falls back to the browser's
 * IndexedDB sale queue. Renders nothing when everything is synced, so it
 * costs no vertical space during normal trading.
 */
export default function OfflineBanner() {
  const { online, pending, syncing, sync, syncNow, lastSyncMessage, serverSync } =
    useOffline();

  // Local-mode backend: the device database is always reachable, so the
  // meaningful signal is cloud connectivity plus the outbox backlog.
  if (serverSync) {
    if (serverSync.online && serverSync.pending === 0 && !serverSync.last_error) {
      return null;
    }

    if (!serverSync.online) {
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#B7791F] px-4 py-2 text-sm text-white">
          <span className="flex items-center gap-2 font-semibold">
            <Dot className="animate-pulse" />
            Offline mode
          </span>
          <span className="text-white/90">
            Working locally, everything is saved on this computer and will sync to the
            cloud automatically when the internet returns.
          </span>
          {serverSync.pending > 0 && (
            <span className="ml-auto rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
              {serverSync.pending} change{serverSync.pending === 1 ? "" : "s"} waiting
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#061161] px-4 py-2 text-sm text-white">
        <span className="flex items-center gap-2 font-semibold">
          <Dot />
          {serverSync.pending > 0 ? "Syncing" : "Sync notice"}
        </span>
        <span className="text-white/90">
          {serverSync.pending > 0
            ? `${serverSync.pending} local change${serverSync.pending === 1 ? "" : "s"} uploading to the cloud.`
            : ""}
          {serverSync.last_error ? ` ${serverSync.last_error}` : ""}
        </span>
        <button
          onClick={syncNow}
          className="ml-auto rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
        >
          Sync now
        </button>
      </div>
    );
  }

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#B7791F] px-4 py-2 text-sm text-white">
        <span className="flex items-center gap-2 font-semibold">
          <Dot className="animate-pulse" />
          Offline mode
        </span>
        <span className="text-white/90">
          Sales are being saved on this device and will upload automatically when the
          connection returns.
        </span>
        {pending > 0 && (
          <span className="ml-auto rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
            {pending} sale{pending === 1 ? "" : "s"} waiting
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#061161] px-4 py-2 text-sm text-white">
      <span className="flex items-center gap-2 font-semibold">
        <Dot />
        Back online
      </span>
      <span className="text-white/90">
        {syncing
          ? `Uploading ${pending} offline sale${pending === 1 ? "" : "s"}...`
          : `${pending} offline sale${pending === 1 ? "" : "s"} still to upload.`}
        {lastSyncMessage && !syncing ? ` ${lastSyncMessage}` : ""}
      </span>
      {!syncing && (
        <button
          onClick={sync}
          className="ml-auto rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
        >
          Sync now
        </button>
      )}
    </div>
  );
}

function Dot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full bg-white ${className}`}
      aria-hidden="true"
    />
  );
}
