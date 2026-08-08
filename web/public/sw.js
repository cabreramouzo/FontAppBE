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

// ---------------------------------------------------------------------------
// Background Sync: enviar la bandeja de salida con la app CERRADA.
//
// Solo Chromium/Android lo soporta (Safari/iOS y Firefox no); allí el vaciado lo hace
// la propia página (src/lib/outbox.ts). OJO: esta lógica es un espejo de la de
// `flushOutbox()` — si cambia el contrato de la API, hay que tocar los dos sitios.
// Va aquí y no en el bundle porque el SW se ejecuta sin la página abierta, y por eso
// mismo no puede leer `localStorage`: el token viaja por IndexedDB (almacén `meta`).
// ---------------------------------------------------------------------------
const OUTBOX_DB = 'fontapp-outbox'
const OUTBOX_DB_VERSION = 2
const CLAIM_TTL_MS = 2 * 60 * 1000
const MAX_ATTEMPTS = 3

function outboxDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, OUTBOX_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idb(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const rq = run(db.transaction(store, mode).objectStore(store))
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
}

// Lanza un error si la respuesta no es 2xx, distinguiendo lo transitorio.
async function post(url, token, body, isForm) {
  const headers = { Authorization: `Bearer ${token}` }
  if (!isForm) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { method: 'POST', headers, body: isForm ? body : JSON.stringify(body) })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

async function syncOutbox() {
  const db = await outboxDB()
  const session = await idb(db, 'meta', 'readonly', (s) => s.get('session'))
  if (!session || !session.token) return // sin sesión no podemos enviar nada
  const base = session.apiBase || '/api'
  const items = (await idb(db, 'items', 'readonly', (s) => s.getAll())).sort((a, b) => a.id - b.id)
  const now = Date.now()

  for (const item of items) {
    if (item.claimedAt && now - item.claimedAt < CLAIM_TTL_MS) continue // lo envía la página
    await idb(db, 'items', 'readwrite', (s) => s.put({ ...item, claimedAt: Date.now() }))
    try {
      let image = item.data.image
      if (item.photo) {
        const form = new FormData()
        form.append('file', new File([item.photo], item.photoName || 'photo.jpg', { type: item.photo.type || 'image/jpeg' }))
        image = (await post(`${base}/images`, session.token, form, true)).url
      }
      if (item.kind === 'font') {
        const font = await post(`${base}/fonts`, session.token, { ...item.data, image })
        if (item.waterStatus) {
          try {
            await post(`${base}/fonts/${font.id}/comments`, session.token, { waterStatus: item.waterStatus })
          } catch (_) { /* la fuente ya está creada */ }
        }
      } else {
        await post(`${base}/fonts/${item.fontID}/comments`, session.token, { ...item.data, image })
      }
      await idb(db, 'items', 'readwrite', (s) => s.delete(item.id))
    } catch (e) {
      const status = e && e.status
      // Transitorio (sin red, sesión, servidor caído): soltamos la marca y relanzamos
      // para que el navegador reintente este sync más tarde.
      if (!status || status === 401 || status >= 500) {
        await idb(db, 'items', 'readwrite', (s) => s.put({ ...item, claimedAt: 0 }))
        throw e
      }
      // 4xx: estos datos no van a entrar nunca; unos reintentos y fuera.
      const attempts = (item.attempts || 0) + 1
      if (attempts >= MAX_ATTEMPTS) await idb(db, 'items', 'readwrite', (s) => s.delete(item.id))
      else await idb(db, 'items', 'readwrite', (s) => s.put({ ...item, attempts, claimedAt: 0 }))
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'fontapp-outbox') event.waitUntil(syncOutbox())
})
