// Delta Board Service Worker

const CACHE_VERSION = '{{VERSION}}';
const CACHE_NAME = `deltaboard-v${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/css/shared.css',
  '/css/styles.css',
  '/js/app.js',
  '/js/theme.js',
  '/js/board.js',
  '/js/connection.js',
  '/js/dedup.js',
  '/js/landing.js',
  '/js/merge.js',
  '/js/operations.js',
  '/js/storage.js',
  '/js/sync.js',
  '/js/types.js',
  '/js/validation.js',
  '/images/mark.svg',
  '/images/happy-delta.svg',
  '/images/sad-delta.svg',
  '/favicon.svg',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/manifest.json',
  '/404.html'
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('deltaboard-v') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for navigation, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Navigation requests (HTML pages): network-first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh response for offline use
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
  );
});
