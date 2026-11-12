const prefix = 'atuel-shell-v4-';
const staticPrefix = 'atuel-static-v4-';
const revision = new URL(self.location.href).searchParams.get('build') || 'initial';
const shellCache = `${prefix}${revision}`;
const staticCache = `${staticPrefix}${revision}`;
const shellRoutes = new Set([
  '/', '/dashboard', '/dashboard/huevos', '/dashboard/lotes', '/dashboard/admin',
  '/dashboard/admin/lotes', '/dashboard/admin/stock', '/dashboard/admin/sanidad',
  '/dashboard/admin/tareas', '/dashboard/admin/analisis', '/dashboard/admin/actividad',
]);
const publicAssets = new Set(['/logo.webp', '/manifest.json', '/favicon.ico']);

async function fetchShell(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // Los documentos son estáticos. Las consultas de datos y la sesión siguen en el cliente.
    const response = await fetch(path, {
      credentials: 'omit', cache: 'reload', signal: controller.signal,
    });
    if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`No se pudo preparar ${path}`);
    }
    const html = await response.clone().text();
    return { path, response, html };
  } finally {
    clearTimeout(timeout);
  }
}

async function prepareOffline() {
  const pages = await Promise.all([...shellRoutes].map(fetchShell));
  const assets = new Set(publicAssets);
  for (const { html } of pages) {
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g)) {
      assets.add(match[1].replaceAll('&amp;', '&'));
    }
  }

  const staticFiles = await caches.open(staticCache);
  await staticFiles.addAll([...assets].map(path => new Request(path, { credentials: 'omit' })));
  const pagesCache = await caches.open(shellCache);
  await Promise.all(pages.map(({ path, response }) => pagesCache.put(path, response)));
}

self.addEventListener('install', event => {
  event.waitUntil(prepareOffline().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const obsolete = keys.filter(key => (key.startsWith(prefix) && key !== shellCache)
      || (key.startsWith(staticPrefix) && key !== staticCache)
      || /^atuel-(pages|static)-v[123]$/.test(key));
    await Promise.all(obsolete.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function navigate(request, path) {
  if (self.navigator.onLine !== false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response.status < 500) return response;
    } catch {
      // Con la red caída se usa el documento del mismo recorrido.
    } finally {
      clearTimeout(timeout);
    }
  }

  const cached = await caches.match(path, { cacheName: shellCache, ignoreVary: true });
  return cached ?? new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Control Criadero</title><main><h1>Sin conexión</h1><p>Conectate y abrí Control Criadero para preparar el uso sin conexión.</p><a href="/">Volver al inicio</a></main></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && shellRoutes.has(url.pathname)) {
    event.respondWith(navigate(request, url.pathname));
  } else if (url.pathname.startsWith('/_next/static/') || publicAssets.has(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: staticCache, ignoreSearch: true });
      return cached ?? fetch(request);
    })());
  }
  // Las transiciones RSC de Next y las API siguen su flujo de red habitual.
});
