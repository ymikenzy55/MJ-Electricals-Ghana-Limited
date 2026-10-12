"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { API_URL } from "@/lib/api";

const POLL_MS = 8000;

/**
 * Keeps the storefront current without reloads.
 *
 * Every few seconds (only while the tab is visible) it asks the API for a
 * fingerprint of the catalog, prices, stock and site settings. The moment that
 * changes, e.g. a product edited or a sale made in the POS, it re-renders
 * the current page's server data and tells client components to refetch.
 */
export default function LiveRefresh() {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router; // keep the latest router without re-running the poller

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${API_URL}/api/v1/catalog/version`, { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (last.current !== null && v !== last.current) {
          window.dispatchEvent(new Event("mj:data-changed"));
          routerRef.current.refresh();
        }
        last.current = v;
      } catch { /* offline or API restarting, try again next tick */ }
    }
    check();
    const id = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, []);

  return null;
}
