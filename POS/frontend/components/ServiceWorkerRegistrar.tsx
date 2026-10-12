"use client";

import { useEffect } from "react";

/** Registers the POS service worker so the terminal keeps working offline.
 *
 * Only active in production builds, in development a previously-registered
 * worker keeps serving stale page shells and unhashed chunks from its caches,
 * which makes design changes appear not to apply. So in dev we unregister any
 * existing worker and purge its caches instead.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      caches.keys().then((keys) => {
        keys
          .filter((k) => k.startsWith("mj-pos-"))
          .forEach((k) => caches.delete(k));
      });
      return;
    }

    // Register after load so it never competes with first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is optional; ignore failures */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
