const CACHE_NAME = 'quest-mobile-cache-v31';
const URLS_TO_CACHE = [
  './style.css',
  './manifest.json',
  './assets/logo.jpg',
  // Icons
  './icons/pause.svg',
  './icons/play.svg',
  './icons/stop.svg',
  './icons/calendar.svg',
  './icons/clock.svg',
  './icons/cross.svg',
  './icons/save.svg',
  './icons/chevron-down.svg',
  './icons/arrow-left.svg',
  './icons/arrow-right.svg',
  './icons/plus.svg',
  './icons/power.svg',
  './icons/progress-outline.svg',
  './icons/progress-filled.svg',
  './icons/start-outline.svg',
  './icons/start-filled.svg',
  './icons/planner-outline.svg',
  './icons/planner-filled.svg',
  // External assets
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  // Do not touch Supabase API calls
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  // HTML/documents: network first, no forced caching
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // JS/HTML: always network (avoid stale code)
  const url = event.request.url;
  if (url.endsWith('.js') || url.endsWith('.mjs') || url.endsWith('.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        });
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames => Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      ))
    ])
  );
});
