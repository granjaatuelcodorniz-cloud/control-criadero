// Service worker de Granja Atuel — offline (versión segura).
// Estrategia conservadora para NO interferir con la app online:
//  - Estáticos con hash (/_next/static, imágenes, fuentes): cache-first (inmutables por hash).
//  - Navegación de documento completa: network-first con timeout + fallback a caché.
//  - RSC / transiciones internas del App Router: NO se tocan (van directo a la red), para no
//    romper el streaming de Next.
//  - Supabase u otros orígenes: NO se tocan.
// Subir VERSION invalida cachés viejos.

const VERSION = 'v3';
const STATIC_CACHE = `atuel-static-${VERSION}`;
const PAGES_CACHE = `atuel-pages-${VERSION}`;
const NAV_TIMEOUT_MS = 4000;

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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Solo la navegación completa de documento. Las transiciones internas (RSC) van a la red.
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
  }
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

async function navigate(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
    const res = await fetch(request, { signal: controller.signal }).finally(() => clearTimeout(t));
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const home = (await cache.match('/dashboard')) || (await cache.match('/'));
    return home || Response.error();
  }
}
