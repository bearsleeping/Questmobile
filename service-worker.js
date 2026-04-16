const CACHE_VERSION = "v1.2.0";
const STATIC_CACHE = `worklog-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `worklog-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "./offline.html";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./supabase-config.js",
  "./achievements.json",
  "./rank-config.json",
  "./community-config.json",
  "./earnings-config.json",
  "./weekly-challenges.json",
  "./manifest.webmanifest",
  "./offline.html",
  "./assets/icon.svg",
  "./assets/icons/icon-120.png",
  "./assets/icons/icon-152.png",
  "./assets/icons/icon-167.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-512.png",
  "./assets/splash/splash-750x1334.png",
  "./assets/splash/splash-828x1792.png",
  "./assets/splash/splash-1080x2340.png",
  "./assets/splash/splash-1125x2436.png",
  "./assets/splash/splash-1170x2532.png",
  "./assets/splash/splash-1179x2556.png",
  "./assets/splash/splash-1242x2208.png",
  "./assets/splash/splash-1242x2688.png",
  "./assets/splash/splash-1284x2778.png",
  "./assets/splash/splash-1290x2796.png",
  "./assets/splash/splash-1488x2266.png",
  "./assets/splash/splash-1536x2048.png",
  "./assets/splash/splash-1620x2160.png",
  "./assets/splash/splash-1668x2224.png",
  "./assets/splash/splash-1668x2388.png",
  "./assets/splash/splash-2048x2732.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const results = await Promise.allSettled(
        STATIC_ASSETS.map((asset) => cache.add(asset))
      );
      const failed = results.some((r) => r.status === "rejected");
      if (failed) {
        // Avoid blocking install on flaky networks (common on iOS).
        await cache.add("./index.html").catch(() => {});
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
  if (self.registration.navigationPreload) {
    self.registration.navigationPreload.enable().catch(() => {});
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === location.origin;
  const isJsonRequest = isSameOrigin && url.pathname.endsWith(".json");
  const isApiPath = isSameOrigin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rest/"));
  const isSupabaseHost = /(^|\\.)supabase\\.co$/.test(url.hostname);
  const isSupabaseApi =
    isSupabaseHost &&
    (url.pathname.startsWith("/rest/v1/") ||
      url.pathname.startsWith("/storage/v1/") ||
      url.pathname.startsWith("/functions/v1/"));

  if (isJsonRequest || isApiPath) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        } catch {
          return caches.match(request);
        }
      })()
    );
    return;
  }

  if (isSupabaseApi) {
    event.respondWith(
      fetch(request).catch(() => new Response(null, { status: 503, statusText: "Offline" }))
    );
    return;
  }

  if (isSameOrigin) {
    if (request.mode === "navigate") {
      event.respondWith(
        (async () => {
          const preload = await event.preloadResponse;
          if (preload) {
            const copy = preload.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return preload;
          }
          return fetch(request);
        })()
          .then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() =>
            caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
          )
      );
      return;
    }

    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => null);

        // Stale-while-revalidate: return cache fast, refresh in background.
        if (cached) return cached;

        // Do not serve offline HTML for scripts/styles; fall back to empty response.
        return (await fetchPromise) || new Response("", { status: 504, statusText: "Offline" });
      })()
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
