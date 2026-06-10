/* BarrelScout service worker — offline support.
   Strategy: network-first for same-origin GETs (so the app stays fresh online),
   falling back to cache when offline. Cross-origin requests (Gemini, Vision,
   UPCitemdb, CORS proxies, the html5-qrcode CDN) are never intercepted. */
const CACHE = 'barrelscout-v3';

// Let the page tell a freshly-installed SW to activate immediately.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
const CORE = [
  './',
  './index.html',
  './bottles.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // don't touch POSTs (API calls)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // let cross-origin pass straight to network

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Update cache with the fresh copy
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        // Offline: serve from cache; for navigations fall back to the app shell
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
