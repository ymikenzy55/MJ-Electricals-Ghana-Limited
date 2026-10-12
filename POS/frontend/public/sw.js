/* MJ Electricals POS service worker.
 *
 * Strategy:
 *  - Navigation requests: network first, fall back to the cached shell so the
 *    terminal still opens with no connection.
 *  - Static assets (_next/static, images): cache first, they are hashed.
 *  - API GETs: network first with a cache fallback so read screens degrade
 *    gracefully. API writes are never cached; the app queues them in IndexedDB.
 */

// Bump this whenever the caching strategy or cached resources change — the
// activate handler deletes every cache whose name doesn't match this version.
const VERSION = "v4";
const SHELL_CACHE = `mj-pos-shell-${VERSION}`;
const STATIC_CACHE = `mj-pos-static-${VERSION}`;
const API_CACHE = `mj-pos-api-${VERSION}`;

const SHELL_URLS = ["/", "/login", "/pos", "/offline", "/MJ_Logo.jpg"];

// API paths that must never be stored in the cache (credentials, sync control,
// settings and anything proxied to the website admin).
const NO_CACHE_API = ["/api/v1/auth", "/api/v1/sync", "/api/v1/settings", "/api/v1/system", "/api/v1/website-admin"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![SHELL_CACHE, STATIC_CACHE, API_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin requests (Cloudinary product photos) go straight to the
  // network: the worker's own fetch() is bound by connect-src and would block them.
  if (url.origin !== self.location.origin) return;

  // Static assets: cache first.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request)
            .then((res) => {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
              return res;
            })
            .catch(() => hit),
      ),
    );
    return;
  }

  // Page navigations: network first, cached shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match("/pos") || caches.match("/")),
        ),
    );
    return;
  }

  // API reads: network first, cache fallback.
  if (url.pathname.startsWith("/api/") && !NO_CACHE_API.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request)),
    );
  }
});

// Let the page trigger a background sync attempt.
self.addEventListener("message", (event) => {
  if (event.data === "sync-sales") {
    // Register a Background Sync tag so the browser retries even if the
    // tab is closed. Falls back to a direct client message on browsers
    // that don't support Background Sync (e.g. Safari).
    if (self.registration && "sync" in self.registration) {
      self.registration.sync.register("sync-sales").catch(() => {
        self.clients.matchAll().then((clients) =>
          clients.forEach((c) => c.postMessage("sync-sales")),
        );
      });
    } else {
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage("sync-sales")),
      );
    }
  }
});

// Background Sync handler — fires when the browser regains connectivity
// and a "sync-sales" tag is registered, even if the tab is closed.
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-sales") {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          clients.forEach((c) => c.postMessage("sync-sales"));
        }
        // If no clients are open the sync will be retried next time a
        // client opens — the IndexedDB queue is durable.
      }),
    );
  }
});
