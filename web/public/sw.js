// Service worker: PWA instalable + uso offline de las zonas ya visitadas.
// - Shell propio: cache-first.
// - Teselas del mapa (OSM, otro dominio): cache-first con tope (LRU sencillo).
// - API GET del mismo origen: stale-while-revalidate (sirve al instante, refresca si hay red).
// - Navegación SPA: network-first con respaldo en el shell.
const SHELL_CACHE = 'fontapp-shell-v2'
const TILE_CACHE = 'fontapp-tiles-v1'
const API_CACHE = 'fontapp-api-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']
const TILE_LIMIT = 700 // ~ suficiente para la zona de una ruta sin llenar el móvil

const isTile = (url) => /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname)

// LRU básico: si el caché supera el máximo, borra las entradas más antiguas.
async function trimCache(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  if (keys.length <= max) return
  for (const k of keys.slice(0, keys.length - max)) await cache.delete(k)
}

async function cacheFirst(req, cacheName, { limit } = {}) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  // Cacheamos respuestas OK y opacas (las teselas <img> son cross-origin/opacas).
  if (res && (res.ok || res.type === 'opaque')) {
    await cache.put(req, res.clone())
    if (limit) trimCache(cacheName, limit)
  }
  return res
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => hit) // sin red: nos quedamos con lo cacheado
  return hit || network
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, TILE_CACHE, API_CACHE])
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Teselas del mapa (otro dominio): cache-first con tope.
  if (isTile(url)) {
    event.respondWith(cacheFirst(req, TILE_CACHE, { limit: TILE_LIMIT }))
    return
  }

  // A partir de aquí, solo nuestro propio origen.
  if (url.origin !== self.location.origin) return

  // API (proxy /api en dev o backend en el mismo origen): stale-while-revalidate.
  if (url.pathname.startsWith('/api')) {
    event.respondWith(staleWhileRevalidate(req, API_CACHE))
    return
  }
  // Imágenes subidas: cache-first.
  if (url.pathname.startsWith('/uploads')) {
    event.respondWith(cacheFirst(req, API_CACHE, { limit: 300 }))
    return
  }

  // Navegación SPA: network-first, respaldo en el shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Assets propios: cache-first.
  event.respondWith(cacheFirst(req, SHELL_CACHE))
})
