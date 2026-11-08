const SHELL_CACHE = 'prosignage-shell-v3';
const MEDIA_CACHE = 'prosignage-media-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (['signage-v2', 'signage-runtime-v2'].includes(name) ||
          (name.startsWith('prosignage-') && ![SHELL_CACHE, MEDIA_CACHE].includes(name))) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try { await cache.put(request, response.clone()); } catch (error) { /* Serve the network response. */ }
    }
    return response;
  } catch (error) {
    return (await cache.match(request)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    try { await cache.put(request, response.clone()); } catch (error) { /* Serve the network response. */ }
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/player.php') && url.searchParams.has('screen') && url.searchParams.has('key')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.endsWith('/assets/css/app.css') || url.pathname.endsWith('/assets/js/player.js')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.includes('/storage/uploads/')) {
    event.respondWith(cacheFirst(request));
  }
});
