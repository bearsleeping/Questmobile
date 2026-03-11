const CACHE_NAME = 'quest-mobile-cache-v26'; // Zwiększamy wersję cache
const URLS_TO_CACHE = [
  './',
  './index.html',
  './style.css', // Główny plik stylów z index.html
  './manifest.json',
  // Nowa architektura modułowa
  './main.js',
  './Engin.js',
  './supabase.config.js',
  // './config.js', // USUNIĘTE: Ten plik nie istnieje fizycznie (jest w window)
  './api/supabase.js',
  './cache/storage.js',
  './app/sync.js',
  './app/scheduler.js',
  './ui/render.js?v=12',
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
  self.skipWaiting(); // <--- KLUCZOWE: Wymuś natychmiastową aktywację nowego SW
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
  // 1. Ignoruj żądania inne niż GET
  if (event.request.method !== 'GET') {
      return;
  }

  // 1.5. Dla nawigacji (index.html) użyj Network First, żeby nie łapać starego stanu na iOS
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 2. IGNORUJ żądania do API Supabase (niech idą prosto do sieci)
  // Aplikacja (sync.js) sama zarządza danymi i trybem offline.
  // Service Worker nie powinien cache'ować dynamicznych zapytań do bazy.
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  // 3. Dla reszty (pliki statyczne, JS, CSS, CDN bibliotek) - Cache First
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(response => {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
            return response;
          });
      })
      .catch(() => caches.match(event.request))
  );
});

// Aktywacja Service Workera i czyszczenie starych pamięci podręcznych
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
