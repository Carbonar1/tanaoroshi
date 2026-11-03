// Service Worker for 棚卸しアシスタント
// インストール時に全画面の HTML と、HTML が参照する JS/CSS を一括で保存する。
// 保管庫内（電波なし）でも、一度も開いていない画面を開けるようにする。

const CACHE_VERSION = "tanaoroshi-v5";

const PRECACHE_ROUTES = [
  "/",
  "/help",
  "/count",
  "/progress",
  "/review",
  "/export",
  "/labels",
  "/scan",
  "/import",
  "/items",
  "/suppliers",
  "/month",
  "/settings",
  "/demo/sheet",
];

const PRECACHE_STATIC = ["/manifest.webmanifest", "/icon.svg"];

function sameOriginAssetUrls(html) {
  const urls = new Set();
  const re = /(?:href|src)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (!u) continue;
    if (
      u.startsWith("/_next/") ||
      u.startsWith("/icon") ||
      u === "/manifest.webmanifest"
    ) {
      urls.add(u);
    }
  }
  return urls;
}

async function cachePut(cache, url, res) {
  if (!res || !res.ok) return;
  try {
    await cache.put(url, res.clone());
  } catch {
    // 一部の opaque/partial 応答は put 不能、無視
  }
}

async function fetchOk(url) {
  try {
    const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
    return res && res.ok ? res : null;
  } catch {
    return null;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const assetUrls = new Set();

      // 各画面の HTML を取得してキャッシュし、参照先の静的ファイルを集める
      await Promise.all(
        PRECACHE_ROUTES.map(async (route) => {
          const res = await fetchOk(route);
          if (!res) return;
          const text = await res.text();
          const html = new Response(text, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
            },
          });
          await cachePut(cache, route, html);
          sameOriginAssetUrls(text).forEach((u) => assetUrls.add(u));
        }),
      );

      // 静的ファイルと参照先アセットを並列取得
      await Promise.all(
        [...PRECACHE_STATIC, ...assetUrls].map(async (url) => {
          const res = await fetchOk(url);
          if (res) await cachePut(cache, url, res);
        }),
      );

      await self.skipWaiting();
    })(),
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
  // API ルートはサーバー側（オンライン時のみ）
  if (url.pathname.startsWith("/api/")) return;

  // ナビゲーション：ネットワーク優先、失敗したらキャッシュから
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          await cachePut(cache, req, net);
          return net;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const cached =
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match(url.pathname, { ignoreSearch: true }));
          if (cached) return cached;
          const fallback = await cache.match("/");
          if (fallback) return fallback;
          return new Response(
            "オフライン：この画面はまだ保存できていません。",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          );
        }
      })(),
    );
    return;
  }

  // それ以外（JS/CSS/画像）：キャッシュ優先、裏で更新
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) {
        fetch(req)
          .then((res) => cachePut(cache, req, res))
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        await cachePut(cache, req, res);
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    })(),
  );
});
