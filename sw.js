// Lab Arcade — Service Worker. Todos os caminhos são relativos (funciona em https://usuario.github.io/repositorio/).
// Estratégia: pré-cache do app; rede primeiro (3 s) com cache de reserva para arquivos do app, para que
// receitas atualizadas cheguem logo e, sem internet, o app abra e calcule. A sincronização com o Supabase
// (fetch/WebSocket para *.supabase.co) NÃO passa por aqui; o app reenvia a fila quando a rede volta.
const VERSION = 'v2';
const APP_CACHE = 'lab-arcade-app-' + VERSION;
const RUNTIME_CACHE = 'lab-arcade-runtime-' + VERSION;
const NETWORK_TIMEOUT_MS = 3000;

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/sync.js',
  './js/supabase-client.js',
  './data/receitas.json',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request, cacheName) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(request, { ignoreSearch: true });
    const timer = setTimeout(() => {
      fromCache().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, NETWORK_TIMEOUT_MS);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        if (res.ok) { const copy = res.clone(); caches.open(cacheName).then((c) => c.put(request, copy)); }
        if (!settled) { settled = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((hit) => { if (!settled) { settled = true; resolve(hit || Response.error()); } });
      });
  });
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then((hit) => hit || fetch(request).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(cacheName).then((c) => c.put(request, copy)); }
    return res;
  }));
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) => cache.match(request).then((hit) => {
    const fresh = fetch(request).then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {                 // arquivos do app
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(req, APP_CACHE).then((r) => (r && r.type !== 'error' ? r : caches.match('./index.html'))));
    } else {
      event.respondWith(networkFirst(req, APP_CACHE));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));  // fontes pixel offline
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));             // SDK Supabase com versão fixa
  }
  // demais origens (inclui *.supabase.co): segue direto para a rede
});
