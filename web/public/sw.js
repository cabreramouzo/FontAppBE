// Service worker: PWA instalable + uso offline de las zonas ya visitadas.
// - Shell propio: cache-first.
// - Teselas del mapa (OSM, otro dominio): cache-first con tope (LRU sencillo).
// - API GET del mismo origen: stale-while-revalidate (sirve al instante, refresca si hay red).
// - Navegación SPA: network-first con respaldo en el shell.
const SHELL_CACHE = 'fontapp-shell-v3'
const TILE_CACHE = 'fontapp-tiles-v1'
const API_CACHE = 'fontapp-api-v1'
// El shell NO se pide a `/index.html`: en Cloudflare Pages esa ruta responde 308 hacia
// `/`, y `cache.addAll` guardaría la respuesta redirigida bajo esa misma clave — que es
// justo la que sirve el respaldo sin conexión. Se pide `/` y se guarda bajo las dos.
const SHELL_EXTRA = ['/manifest.webmanifest', '/icon.svg']
const TILE_LIMIT = 700 // ~ suficiente para la zona de una ruta sin llenar el móvil

const isTile = (url) => /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname)

// Una respuesta que ha pasado por una redirección queda marcada (`res.redirected`), y un
// service worker NO puede devolverla: WebKit corta con "Response served by service worker
// has redirections". Peor todavía, la marca sobrevive al guardarla en la Cache API, así
// que una sola navegación redirigida deja el shell envenenado y la app revienta la
// siguiente vez que tira de caché — normalmente sin cobertura, que es justo cuando hace
// falta.
//
// Pasa más de lo que parece: `http://fontapp.net` redirige a `https://`, y eso es lo que
// hace cualquiera que escriba el dominio en la barra.
//
// Reconstruirla la desmarca. Solo se hace cuando hace falta: leer el cuerpo impide
// servirlo en streaming, y en el caso normal no hay nada que arreglar.
async function sinRedirecciones(res) {
  if (!res || !res.redirected) return res
  return new Response(await res.blob(), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  })
}

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
  const res = await sinRedirecciones(await fetch(req))
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

async function precargaShell() {
  const cache = await caches.open(SHELL_CACHE)
  // `cache: 'reload'` para no precargar lo que ya hubiera en la caché HTTP del navegador.
  const shell = await sinRedirecciones(await fetch('/', { cache: 'reload' }))
  if (shell && shell.ok) {
    await cache.put('/', shell.clone())
    await cache.put('/index.html', shell.clone())
  }
  await Promise.all(
    SHELL_EXTRA.map(async (u) => {
      const res = await sinRedirecciones(await fetch(u, { cache: 'reload' }))
      if (res && res.ok) await cache.put(u, res.clone())
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precargaShell())
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
        .then(async (res) => {
          const limpia = await sinRedirecciones(res)
          if (limpia.ok) {
            const c = await caches.open(SHELL_CACHE)
            await c.put('/index.html', limpia.clone())
          }
          return limpia
        })
        .catch(async () => {
          const c = await caches.open(SHELL_CACHE)
          const hit = await c.match('/index.html')
          // Sin red y sin shell no hay nada que servir; una respuesta clara es mejor
          // que dejar la promesa en nada, que el navegador muestra como error de red.
          return (
            hit ||
            new Response('<h1>Sense connexió</h1>', {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
          )
        }),
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
