const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const CACHE_NAME = isIOS ? 'quest-mobile-cache-ios-v6' : 'quest-mobile-cache-v6';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './mobile.css',
  './Engin.js',
  './supabase.config.js',
  './manifest.json',
  './assets/apple-touch-icon.png',
  './assets/icon-192x192.png',
  './assets/icon-512x512.png',
  './assets/icon-maskable-512x512.png',
  './assets/logo.jpg',
  // Ikony
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
  // Zasoby zewnętrzne
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap'
];

// Instalacja Service Workera i buforowanie zasobów
self.addEventListener('install', event => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Przechwytywanie żądań i serwowanie z pamięci podręcznej
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (isIOS) {
    // Dla iOS, zawsze network-only, bez cache
    return fetch(event.request).catch(() => {
      // Fallback do cache jeśli offline
      return caches.match(event.request);
    });
  }

  const supabaseUrl = 'xmoidyumwzwulwysjikg.supabase.co';

  // Jeśli żądanie jest do API Supabase, nie używaj Service Workera do cachowania.
  // Zawsze próbuj połączyć się z siecią. To zapobiega problemom z przestarzałymi danymi.
  if (event.request.url.includes(supabaseUrl)) {
    // Nie wywołujemy event.respondWith(), co pozwala przeglądarce na normalne obsłużenie żądania.
    // To jest strategia "tylko sieć" (network-only).
    return;
  }

  // Dla zasobów aplikacji stosujemy strategię "Stale-While-Revalidate".
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
        return response || fetchPromise;
      });
    })
  );
});

// Aktywacja Service Workera i czyszczenie starych pamięci podręcznych
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (!cacheWhitelist.includes(cacheName)) {
          return caches.delete(cacheName);
        }
      })
    )).then(() => self.clients.claim()) // Take control of all clients
  );
});