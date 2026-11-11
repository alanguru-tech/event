const CACHE_NAME = 'event-19-11-v1';
const PHOTO_CACHE = 'event-19-11-photos-v1';
const SHELL_FILES = ['./index.html', './background.svg', './images.json'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_FILES.map(async path => {
      try {
        const response = await fetch(new URL(path, self.registration.scope));
        if (response.ok) await cache.put(new URL(path, self.registration.scope), response);
      } catch (_) { }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => ![CACHE_NAME, PHOTO_CACHE].includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_PHOTOS') return;
  const reply = event.ports?.[0];
  event.waitUntil((async () => {
    const cache = await caches.open(PHOTO_CACHE);
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    let next = 0, cached = 0;
    async function worker() {
      while (next < urls.length) {
        const url = urls[next++];
        try {
          const existing = await cache.match(url);
          if (existing) { cached++; continue; }
          const response = await fetch(url);
          if (response.ok && response.type !== 'opaque') {
            await cache.put(url, response.clone());
            cached++;
          }
        } catch (_) { }
      }
    }
    await Promise.all([worker(), worker()]);
    reply?.postMessage({ cached });
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const requestUrl = new URL(request.url);
  const isPhoto = requestUrl.pathname.includes('/images/');
  const isAppFile = requestUrl.pathname.endsWith('/images.json') || requestUrl.pathname.endsWith('/background.svg') || requestUrl.pathname.endsWith('/index.html');
  if (!isPhoto && !isAppFile && request.mode !== 'navigate') return;

  event.respondWith((async () => {
    const cacheName = isPhoto ? PHOTO_CACHE : CACHE_NAME;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (isPhoto && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response.ok || !cached ? response : cached;
    } catch (_) {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const indexUrl = new URL('./index.html', self.registration.scope);
        const fallback = await caches.match(indexUrl.href);
        if (fallback) return fallback;
      }
      return new Response('', { status: 504, statusText: 'Offline and not cached' });
    }
  })());
});
