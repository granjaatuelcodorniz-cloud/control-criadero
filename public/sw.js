// Service worker de Granja Atuel — Fase 1: que la app abra sin conexión + más rápida.
// Estrategia segura:
//  - Páginas (navegación): network-first → con señal siempre lo último; sin señal, lo cacheado.
//  - Estáticos con hash (/_next/static, imágenes, fuentes): cache-first (inmutables por hash).
//  - Llamadas a Supabase u otros orígenes: NO se tocan (van directo a la red; el offline de
//    datos se maneja en la app, Fase 2).
// Subir VERSION invalida cachés viejos.

const VERSION = 'v1';
const STATIC_CACHE = `atuel-static-${VERSION}`;
const PAGES_CACHE = `atuel-pages-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
    );
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
  // Solo mismo origen; Supabase y externos van directo a la red.
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES_CACHE));
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

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = (await cache.match('/dashboard')) || (await cache.match('/'));
    return fallback || Response.error();
  }
}
