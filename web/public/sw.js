// Service worker: PWA instalable + uso offline de las zonas ya visitadas.
// - Shell propio: cache-first.
// - Teselas del mapa (OSM, otro dominio): cache-first con tope (LRU sencillo).
// - API GET del mismo origen: stale-while-revalidate (sirve al instante, refresca si hay red).
// - Navegación SPA: network-first con respaldo en el shell.
const SHELL_CACHE = 'fontapp-shell-v7'
const TILE_CACHE = 'fontapp-tiles-v2'
const API_CACHE = 'fontapp-api-v3'
// El nombre NO sube de versión al sacar las fotos: no ha cambiado el formato de nada, y
// subirlo tiraría las respuestas guardadas de todo el mundo justo en el cambio que existe
// para conservarlas mejor. Las fotos que quedaran dentro se van solas con el recorte.
//
// Las fotos van a su PROPIO caché, no al de la API.
//
// Compartían los 300 huecos, así que mover el mapa unas decenas de veces echaba todas las
// fotos guardadas, y mirar fotos echaba las respuestas del mapa. Dos cosas con ritmos
// completamente distintos peleando por el mismo sitio.
const PHOTO_CACHE = 'fontapp-photos-v1'

// Lo FIJADO: aquí no entra nada solo y de aquí no se borra nada por hacer sitio.
//
// El descarte por orden de llegada es lo que hace que preparar una zona no sirva de nada:
// guardas lo de tu ruta el viernes, el sábado miras otra comarca por curiosidad y lo que
// preparaste ya no está. Sin un sitio a salvo del descarte, cualquier «descarga de zona»
// se evapora sola.
//
// Se mira **antes** que los demás en cada búsqueda, y al revalidar con red se reescribe
// aquí: lo fijado se mantiene fijado y además se actualiza.
const PINNED_CACHE = 'fontapp-pinned-v1'
// El shell NO se pide a `/index.html`: en Cloudflare Pages esa ruta responde 308 hacia
// `/`, y `cache.addAll` guardaría la respuesta redirigida bajo esa misma clave — que es
// justo la que sirve el respaldo sin conexión. Se pide `/` y se guarda bajo las dos.
const SHELL_EXTRA = ['/manifest.webmanifest', '/icon.svg']
const TILE_LIMIT = 700 // ~ suficiente para la zona de una ruta sin llenar el móvil
const PHOTO_LIMIT = 200
// Antes el recorte solo se disparaba al pedir una foto, así que entre foto y foto las
// respuestas de la API crecían sin tope. Ahora cada una recorta la suya.
const API_LIMIT = 200

// Servidores de teselas de TODAS las capas (ver `src/lib/mapLayers.ts`). Antes solo
// estaba OpenStreetMap, así que quien caminaba con el topográfico del IGN —la capa que
// rotula las fuentes con su topónimo, la más útil en el monte— se quedaba sin mapa en
// cuanto perdía cobertura.
//
// La lista se duplica aquí a la fuerza: el service worker es un fichero estático y no
// puede importar el registro de capas. Al añadir una capa nueva hay que tocar los dos
// sitios, y `mapLayers.ts` lo dice.
const TILE_HOSTS = [
  /(^|\.)tile\.openstreetmap\.org$/,
  /(^|\.)tile\.opentopomap\.org$/,
  /(^|\.)arcgisonline\.com$/,
  /(^|\.)ign\.es$/,
  /(^|\.)icgc\.cat$/,
]
const isTile = (url) => TILE_HOSTS.some((re) => re.test(url.hostname))

/// El origen del backend, que llega en la URL de registro del propio SW (ver `main.tsx`).
/// Sin esto, en producción no se cacheaba nada de la API: está en otro dominio y aquí
/// abajo hay un `return` para todo lo que no sea el origen propio.
const API_ORIGIN = (() => {
  try {
    const crudo = new URL(self.location.href).searchParams.get('api')
    return crudo ? new URL(crudo).origin : null
  } catch {
    return null
  }
})()

/// ¿Es una llamada a nuestra API? Vale para los dos montajes: el proxy `/api` de
/// desarrollo y el backend en otro dominio de producción.
const isAPI = (url) =>
  (url.origin === self.location.origin && url.pathname.startsWith('/api')) ||
  (API_ORIGIN !== null && url.origin === API_ORIGIN)

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

/**
 * Lo fijado gana siempre.
 *
 * Devuelve además en qué caché estaba, porque quien revalide tiene que escribir en el
 * mismo: si una respuesta fijada se refrescara en el caché normal, el descarte se la
 * llevaría igual y el fijado no habría servido de nada.
 */
async function buscaFijadoPrimero(req, cacheName) {
  const fijados = await caches.open(PINNED_CACHE)
  const fijado = await fijados.match(req)
  if (fijado) return { hit: fijado, destino: PINNED_CACHE }
  const cache = await caches.open(cacheName)
  return { hit: await cache.match(req), destino: cacheName }
}

async function cacheFirst(req, cacheName, { limit } = {}) {
  const { hit } = await buscaFijadoPrimero(req, cacheName)
  const cache = await caches.open(cacheName)
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
  const { hit, destino } = await buscaFijadoPrimero(req, cacheName)
  const network = fetch(req)
    .then(async (res) => {
      // Se refresca en el caché donde estaba: lo fijado sigue fijado y encima al día.
      if (res && res.ok) {
        const cache = await caches.open(destino)
        await cache.put(req, res.clone())
        if (destino === cacheName) trimCache(cacheName, API_LIMIT)
      }
      return res
    })
    .catch(() => hit) // sin red: nos quedamos con lo cacheado
  if (hit) return hit
  // Sin nada guardado y sin red, `network` resuelve a `undefined` — y devolver eso desde
  // `respondWith` es un fallo opaco del service worker, no un error de red limpio. El
  // cliente necesita lo segundo: `isOffline` mira `ApiError.status === 0`, y de eso
  // depende que la ficha caiga a la zona guardada en vez de enseñar un error.
  const res = await network
  if (res) return res
  throw new TypeError('offline')
}

/**
 * Guarda unas URLs a salvo del descarte.
 *
 * Lo pide la página con `postMessage`. Se hace aquí y no en la página porque la Cache API
 * del service worker es la que consulta `fetch`: lo que guarde la página en otro caché no
 * lo vería nadie.
 *
 * Devuelve cuántas se han guardado, para que quien lo pida pueda decir la verdad en vez
 * de prometer que la zona está lista.
 */
async function fija(urls) {
  const cache = await caches.open(PINNED_CACHE)
  let guardadas = 0
  for (const url of urls) {
    try {
      const res = await sinRedirecciones(await fetch(url, { cache: 'reload' }))
      if (res && res.ok) {
        await cache.put(url, res.clone())
        guardadas += 1
      }
    } catch {
      // Una que falle no puede tumbar las demás: sin red no se fija nada y ya está.
    }
  }
  return guardadas
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
  const keep = new Set([SHELL_CACHE, TILE_CACHE, API_CACHE, PHOTO_CACHE, PINNED_CACHE])
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      // Y se repone el shell si falta. `precargaShell` solo corre en `install`, así que
      // una instalación con la red a medias dejaba la app SIN shell para siempre: todo
      // funcionaba con cobertura y al perderla salía la pantalla de sin conexión, que es
      // exactamente lo que se reportó. Aquí se comprueba en cada arranque del worker.
      .then(async () => {
        const c = await caches.open(SHELL_CACHE)
        if (await c.match('/index.html')) return
        await precargaShell().catch(() => {})
      }),
  )
  self.clients.claim()
})

// La página pide fijar cosas por aquí. Se contesta por el puerto del propio mensaje y no
// a todos los clientes: quien pregunta es quien espera la respuesta.
self.addEventListener('message', (event) => {
  const datos = event.data
  if (!datos || datos.tipo !== 'fijar' || !Array.isArray(datos.urls)) return
  const puerto = event.ports && event.ports[0]
  event.waitUntil(
    fija(datos.urls).then((guardadas) => {
      if (puerto) puerto.postMessage({ guardadas })
    }),
  )
})

/**
 * La pantalla de último recurso cuando no hay red **ni shell guardado**.
 *
 * Era un `<h1>Sense connexió</h1>` pelado: catalán a la fuerza, con la fuente serif del
 * navegador y **sin una sola línea de JavaScript**, así que al volver la cobertura se
 * quedaba ahí para siempre — no había nadie escuchando. Reportado desde el monte con una
 * captura, y hasta entonces parecía un fallo de la app y no del service worker.
 *
 * Los ocho idiomas van escritos aquí dentro a la fuerza: el service worker es un fichero
 * estático que Vite no procesa, así que no puede importar los diccionarios. Se elige con
 * `navigator.language`, que es lo único que tiene a mano — `localStorage` no lo ve.
 */
const SIN_CONEXION = {
  ca: ['Sense connexió', 'No hem pogut carregar aquesta pantalla i no en tenim cap còpia al mòbil. Es tornarà a provar sola quan torni la cobertura.', 'Tornar-ho a provar'],
  es: ['Sin conexión', 'No hemos podido cargar esta pantalla y no tenemos ninguna copia en el móvil. Se reintentará sola cuando vuelva la cobertura.', 'Reintentar'],
  gl: ['Sen conexión', 'Non puidemos cargar esta pantalla e non temos ningunha copia no móbil. Reintentarase soa cando volva a cobertura.', 'Reintentar'],
  eu: ['Konexiorik gabe', 'Ezin izan dugu pantaila hau kargatu eta ez dugu kopiarik mugikorrean. Estaldura itzultzean bere kabuz saiatuko da berriro.', 'Saiatu berriro'],
  en: ['No connection', 'We could not load this screen and there is no copy saved on your phone. It will retry by itself when the signal comes back.', 'Try again'],
  fr: ['Hors connexion', 'Impossible de charger cet écran et aucune copie n’est enregistrée sur le téléphone. Nouvelle tentative automatique dès le retour du réseau.', 'Réessayer'],
  pt: ['Sem ligação', 'Não conseguimos carregar este ecrã e não há nenhuma cópia guardada no telemóvel. Voltará a tentar sozinho quando a rede regressar.', 'Tentar de novo'],
  it: ['Senza connessione', 'Non siamo riusciti a caricare questa schermata e non c’è nessuna copia salvata sul telefono. Riproverà da solo quando torna il segnale.', 'Riprova'],
}

function paginaSinConexion() {
  const codigo = (self.navigator && self.navigator.language ? self.navigator.language : 'ca')
    .slice(0, 2).toLowerCase()
  const [titulo, texto, boton] = SIN_CONEXION[codigo] || SIN_CONEXION.ca
  const html = `<!doctype html><html lang="${codigo}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><style>
:root{--bg:#fff;--fg:#1a1a1a;--muted:#6b7280;--accent:#0ea5e9;--accent-fg:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--fg:#e5e7eb;--muted:#9ca3af;--accent:#38bdf8;--accent-fg:#06202c}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
gap:14px;padding:32px;text-align:center;background:var(--bg);color:var(--fg);
font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1{margin:0;font-size:22px}
p{margin:0;max-width:34ch;color:var(--muted);font-size:15px}
button{min-height:48px;padding:0 22px;border:0;border-radius:24px;background:var(--accent);
color:var(--accent-fg);font:inherit;font-weight:600;cursor:pointer}
</style></head><body>
<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
 stroke-linecap="round" aria-hidden="true" style="color:var(--muted)">
<path d="M3 3l18 18M5.6 9.6A9 9 0 0 1 9 7.6M2 8.8a15 15 0 0 1 4-2.8M22 8.8a15 15 0 0 0-9.6-3.7M8.5 13a5 5 0 0 1 2-1.2M12 18h.01"/></svg>
<h1>${titulo}</h1><p>${texto}</p>
<button onclick="location.reload()">${boton}</button>
<script>
// Lo que faltaba: aquí no hay app, así que si nadie escucha, esta pantalla se queda para
// siempre aunque el móvil ya tenga cobertura. Se recarga sola al volver la red y al
// volver a primer plano — en un móvil, «online» a veces no llega hasta que miras.
addEventListener('online', function () { location.reload() })
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && navigator.onLine) location.reload()
})
<\/script></body></html>`
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Teselas del mapa (otro dominio): cache-first con tope.
  if (isTile(url)) {
    event.respondWith(cacheFirst(req, TILE_CACHE, { limit: TILE_LIMIT }))
    return
  }

  // Fotos subidas, vengan del disco local o de R2 (otro dominio). Se mira la ruta y no
  // el servidor a propósito: así vale para los dos sitios sin apuntar ninguno.
  if (url.pathname.includes('/uploads/')) {
    event.respondWith(cacheFirst(req, PHOTO_CACHE, { limit: PHOTO_LIMIT }))
    return
  }

  // Nuestra API. Va ANTES del corte por origen porque en producción está en otro dominio.
  if (isAPI(url)) {
    // **Nada autenticado se guarda.** La caché del service worker la comparten todas las
    // sesiones del navegador, así que una respuesta con `Authorization` podría acabar
    // sirviéndosele a otra persona en el mismo móvil. Se mira la cabecera y no una lista
    // de rutas: la lista se queda vieja en cuanto se añade un endpoint privado, y aquí ya
    // pasó — solo estaba contemplado `/gamification/me`, y `/notifications` o
    // `/gamification/guarded` se habrían cacheado en cuanto el enrutado funcionara.
    // La lista se mantiene igualmente por si alguna cabecera no llegara hasta aquí.
    const privada =
      req.headers.has('authorization') ||
      /\/(gamification\/(me|guarded|badges)|notifications|auth)(\/|$|\?)/.test(url.pathname)
    if (privada) {
      event.respondWith(fetch(req))
      return
    }
    event.respondWith(staleWhileRevalidate(req, API_CACHE))
    return
  }

  // A partir de aquí, solo nuestro propio origen.
  if (url.origin !== self.location.origin) return

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
          // Las DOS claves. `precargaShell` guarda el shell bajo `/` y `/index.html`,
          // pero aquí solo se miraba la segunda: si por lo que sea solo había una, la
          // app tenía su shell guardado y aun así salía la pantalla de sin conexión.
          const hit = (await c.match('/index.html')) || (await c.match('/'))
          // Sin red y sin shell no hay nada que servir; una respuesta clara es mejor
          // que dejar la promesa en nada, que el navegador muestra como error de red.
          return hit || paginaSinConexion()
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
async function post(url, token, body, isForm, queuedOffline = false, method = 'POST') {
  const headers = { Authorization: `Bearer ${token}` }
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (queuedOffline) headers['X-FontApp-Queued-Offline'] = '1'
  const res = await fetch(url, { method, headers, body: isForm ? body : JSON.stringify(body) })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

/**
 * La imagen que ya traía un elemento de la cola, si la traía.
 *
 * Existe como función y no como `item.data.image` a pelo porque el tipo `photo` **no lleva
 * `data`**: leerlo directamente reventaba con un `TypeError`, que al no traer `status` se
 * tomaba por fallo transitorio y se reintentaba para siempre con la cola atascada.
 */
function imagenDe(item) {
  return (item.data || {}).image
}

/**
 * La petición principal de un elemento de la cola. **Pura**, y por eso se puede probar:
 * es la decisión que se equivocó, y no daba la cara hasta estar sin cobertura.
 *
 * El alta de fuente tiene además un segundo envío (el estado inicial), que depende del id
 * que devuelve el primero y por tanto se queda en `syncOutbox`.
 */
function peticionDeSalida(item, base, image) {
  if (item.kind === 'font') {
    return { method: 'POST', url: `${base}/fonts`, body: { ...item.data, image } }
  }
  if (item.kind === 'photo') {
    // Sin imagen no hay nada que mandar: el elemento solo es la foto.
    return image ? { method: 'PUT', url: `${base}/fonts/${item.fontID}/photo`, body: { image } } : null
  }
  return { method: 'POST', url: `${base}/fonts/${item.fontID}/comments`, body: { ...item.data, image } }
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
      let image = imagenDe(item)
      if (item.photo) {
        const form = new FormData()
        form.append('file', new File([item.photo], item.photoName || 'photo.jpg', { type: item.photo.type || 'image/jpeg' }))
        image = (await post(`${base}/images`, session.token, form, true)).url
      }
      const peticion = peticionDeSalida(item, base, image)
      if (peticion) {
        const creada = await post(peticion.url, session.token, peticion.body, false, true, peticion.method)
        // El estado que se indicó al crear la fuente, como primera actualización.
        if (item.kind === 'font' && item.waterStatus) {
          try {
            await post(`${base}/fonts/${creada.id}/comments`, session.token, { waterStatus: item.waterStatus }, false, true)
          } catch (_) { /* la fuente ya está creada */ }
        }
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
