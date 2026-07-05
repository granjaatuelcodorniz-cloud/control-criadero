// Service worker de Granja Atuel — offline.
// Estrategia segura:
//  - Estáticos con hash (/_next/static, imágenes, fuentes): cache-first (inmutables por hash).
//  - Resto de same-origin (páginas + transiciones RSC del App Router): network-first con fallback
//    a caché → con señal siempre lo último (nunca queda pegado a versión vieja); sin señal, lo
//    cacheado, así la navegación interna funciona offline.
//  - Llamadas a Supabase u otros orígenes: NO se tocan (van directo a la red; el offline de datos
//    lo maneja la app).
// Subir VERSION invalida cachés viejos.

const VERSION = 'v2';
const STATIC_CACHE = `atuel-static-${VERSION}`;
const PAGES_CACHE = `atuel-pages-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isStaticAsset = (pathname) =>
  pathname.startsWith('/_next/static/') ||
  /\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg|ico|json)$/.test(pathname);

// Clave de caché que separa las transiciones RSC (App Router) del HTML completo de la misma URL.
function pageKey(request) {
  const url = new URL(request.url);
  const isRsc = request.headers.has('RSC') || request.headers.has('Rsc') || url.searchParams.has('_rsc');
  url.searchParams.delete('_rsc');
  if (isRsc) url.searchParams.set('__rsc', '1');
  return url.toString();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase y externos: red directa

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  const key = pageKey(request);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const home = (await cache.match(pageKey(new Request(self.location.origin + '/dashboard'))))
        || (await cache.match(pageKey(new Request(self.location.origin + '/'))));
      if (home) return home;
    }
    return Response.error();
  }
}
