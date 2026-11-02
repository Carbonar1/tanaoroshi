// Service Worker for 棚卸しアシスタント
// Strategy: precache shell routes, network-first for navigations, cache-first for assets.

const CACHE_VERSION = "tanaoroshi-v1";
const PRECACHE_URLS = [
  "/",
  "/count",
  "/progress",
  "/export",
  "/suppliers",
  "/items",
  "/import",
  "/settings",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((u) =>
            cache.add(new Request(u, { cache: "reload" })).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, net.clone());
          return net;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match(req);
          if (cached) return cached;
          const fallback = await cache.match("/");
          if (fallback) return fallback;
          return new Response("オフライン：まだこの画面を読み込んでいません。", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) {
        fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
          })
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    })(),
  );
});
