/* MJ Attendance: lets the worker portal open and scan with no signal.
 * Only the worker pages and static files are cached. Nothing from the API. */
const V = "v1";
const PAGES = `mj-att-pages-${V}`;
const STATIC = `mj-att-static-${V}`;
const SHELL = ["/worker", "/worker/home", "/worker/scan", "/worker/history", "/MJ_Logo.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => undefined)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![PAGES, STATIC].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static") || /\.(?:png|jpg|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.mode === "navigate" && url.pathname.startsWith("/worker")) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) caches.open(PAGES).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(async () => (await caches.match(req)) || (await caches.match("/worker/home")) || (await caches.match("/worker")) || Response.error()));
  }
});
