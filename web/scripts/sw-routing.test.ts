import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Comprueba a quién decide cachear el service worker.
 *
 * Existe porque ahí hubo un fallo que no dio la cara **nunca**: el enrutado de la API era
 * `pathname.startsWith('/api')`, que solo acierta en desarrollo —donde Vite hace de proxy
 * en el mismo origen—. En producción el backend está en otro dominio, así que no se cacheó
 * ni una respuesta: el caché `fontapp-api-v2` ni llegó a existir. La app abría sin
 * cobertura y no tenía ni una fuente que enseñar.
 *
 * No se puede registrar un service worker en un test, pero sí cargar su código con un
 * `self` de mentira y preguntarle por sus decisiones, que es donde estaba el error.
 */
function cargaSW(hrefDelSW: string) {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const self = {
    location: { href: hrefDelSW, origin: new URL(hrefDelSW).origin },
    addEventListener: () => {},
    skipWaiting: () => {},
    clients: { claim: () => {} },
    registration: {},
  }
  const fn = new Function('self', 'caches', 'fetch', 'Response', 'clients',
    `${codigo}\n;return { isTile, isAPI, API_ORIGIN, peticionDeSalida, imagenDe, fetchConTimeout };`)
  return fn(self, {}, () => {}, class {}, {})
}

test('el shell actual invalida el bundle persistente anterior', () => {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(codigo, /const SHELL_CACHE = 'fontapp-shell-v8'/)
  // El remedio no debe borrar mapas ni respuestas offline. Este test ya ha cazado un
  // intento de subir `API_CACHE` sin que hubiera cambiado ningún formato: habría tirado
  // lo guardado de todo el mundo en el cambio que existía para conservarlo mejor.
  assert.match(codigo, /const TILE_CACHE = 'fontapp-tiles-v2'/)
  assert.match(codigo, /const API_CACHE = 'fontapp-api-v3'/)
  assert.match(codigo, /const PHOTO_CACHE = 'fontapp-photos-v1'/)
  assert.match(codigo, /const PINNED_CACHE = 'fontapp-pinned-v1'/)
})

const PROD = cargaSW('https://fontapp.net/sw.js?api=https%3A%2F%2Ffontapp.fly.dev')
const DEV = cargaSW('http://localhost:5173/sw.js')

test('en producción reconoce la API aunque esté en otro dominio', () => {
  assert.equal(PROD.API_ORIGIN, 'https://fontapp.fly.dev')
  assert.ok(PROD.isAPI(new URL('https://fontapp.fly.dev/fonts/in-bounds?minLat=41')))
  assert.ok(PROD.isAPI(new URL('https://fontapp.fly.dev/activity?limit=24')))
})

test('en desarrollo sigue valiendo el proxy /api del mismo origen', () => {
  assert.equal(DEV.API_ORIGIN, null)
  assert.ok(DEV.isAPI(new URL('http://localhost:5173/api/fonts')))
})

test('lo que no es nuestra API no se toca', () => {
  assert.ok(!PROD.isAPI(new URL('https://fontapp.net/assets/index.js')))
  assert.ok(!PROD.isAPI(new URL('https://cloudflareinsights.com/beacon.js')))
  assert.ok(!DEV.isAPI(new URL('http://localhost:5173/assets/index.js')))
})

test('se guardan las teselas de TODAS las capas, no solo las de OSM', () => {
  // La lista sale de `src/lib/mapLayers.ts`. Antes solo entraba la primera, así que quien
  // caminaba con el topográfico del IGN se quedaba sin mapa al perder cobertura.
  for (const host of [
    'a.tile.openstreetmap.org',
    'b.tile.opentopomap.org',
    'server.arcgisonline.com',
    'www.ign.es',
    'geoserveis.icgc.cat',
  ]) {
    assert.ok(PROD.isTile(new URL(`https://${host}/12/2071/1523.png`)), host)
  }
  assert.ok(!PROD.isTile(new URL('https://fontapp.net/icon.svg')))
  // Y que el ancla del dominio siga puesta: un dominio que solo *acabe* parecido, fuera.
  assert.ok(!PROD.isTile(new URL('https://noesign.es.example.com/1/2/3.png')))
})

// --- Bandeja de salida ------------------------------------------------------------
//
// Lo que se envía cuando vuelve la red. Se prueba aquí porque el fallo que hubo era
// exactamente de esta forma: invisible con cobertura, y sin cobertura te comes la cola
// atascada sin un solo mensaje de error.

test('la foto suelta se manda con PUT a la ruta de la foto, no como reseña', () => {
  const p = PROD.peticionDeSalida({ kind: 'photo', fontID: 'F1' }, '/api', '/uploads/a.jpg')
  assert.deepEqual(p, { method: 'PUT', url: '/api/fonts/F1/photo', body: { image: '/uploads/a.jpg' } })
})

test('un elemento `photo` no lleva `data`, y leerlo no puede reventar', () => {
  // Esto es el fallo real: `item.data.image` lanzaba un TypeError. Un error sin `status`
  // se toma por transitorio, así que la cola lo reintentaba para siempre y se quedaba
  // bloqueada — sin decir nada, porque nadie mira la consola del service worker.
  assert.doesNotThrow(() => PROD.imagenDe({ kind: 'photo', fontID: 'F1' }))
  assert.equal(PROD.imagenDe({ kind: 'photo', fontID: 'F1' }), undefined)
  assert.equal(PROD.imagenDe({ kind: 'comment', data: { image: '/uploads/b.jpg' } }), '/uploads/b.jpg')
})

test('una foto que no llegó a subirse no manda nada', () => {
  // El elemento ES la foto: sin ella no hay ninguna petición que tenga sentido, y desde
  // luego no una que ponga la portada a `undefined`.
  assert.equal(PROD.peticionDeSalida({ kind: 'photo', fontID: 'F1' }, '/api', undefined), null)
})

test('el alta y la reseña siguen yendo por donde iban', () => {
  const alta = PROD.peticionDeSalida({ kind: 'font', data: { name: 'Font' } }, '/api', '/uploads/a.jpg')
  assert.deepEqual(alta, { method: 'POST', url: '/api/fonts', body: { name: 'Font', image: '/uploads/a.jpg' } })
  const resenya = PROD.peticionDeSalida({ kind: 'comment', fontID: 'F2', data: { body: 'raja' } }, '/api', undefined)
  assert.deepEqual(resenya, { method: 'POST', url: '/api/fonts/F2/comments', body: { body: 'raja', image: undefined } })
})

/**
 * Lo que la cola guarda es la **intención**, y el service worker la reenvía tal cual.
 *
 * De esto depende que sin cobertura pase exactamente lo mismo que con ella. El atajo del
 * globo del mapa encola `confirmIfUnchanged`, y quien decide si eso acaba siendo un parte
 * nuevo o un «sigue igual» es el servidor, al recibirlo. Si este espejo de la cola filtrara
 * los campos que no conoce —o si alguien decidiera aquí en vez de allí— volveríamos a tener
 * dos comportamientos y **la lógica repetida en dos ficheros que no pueden compartirla**:
 * `sw.js` no puede importar de `src/`.
 *
 * Y no vale con «hoy pasa el campo»: lo que se fija es que pasa **cualquier** campo, porque
 * el siguiente se añadirá en `outbox.ts` sin que nadie se acuerde de este fichero.
 */
test('el service worker reenvía la aportación entera, incluidos los campos que no conoce', () => {
  const p = PROD.peticionDeSalida(
    { kind: 'comment', fontID: 'F3', data: { waterStatus: 'flowing', confirmIfUnchanged: true, loQueVenga: 42 } },
    '/api', undefined)
  assert.deepEqual(p, {
    method: 'POST',
    url: '/api/fonts/F3/comments',
    body: { waterStatus: 'flowing', confirmIfUnchanged: true, loQueVenga: 42, image: undefined },
  })
})

/**
 * Una tesela que no llega no puede colgar la app.
 *
 * Con cobertura mala `fetch` no falla: la conexión se abre y no avanza, así que la promesa
 * se queda **minutos** sin resolver ni rechazar. Reportado desde una ruta en bici: con 3G
 * el mapa no cargaba. Y no es solo la tesela que falta — el navegador permite unas seis
 * conexiones por dominio, así que decenas de teselas colgadas le hacen cola a todo lo
 * demás, incluidas las fuentes.
 *
 * La misma lección estaba aprendida y escrita en `api/client.ts` desde hace tiempo; aquí
 * no se había aplicado.
 */
test('una petición que no avanza se corta en vez de colgarse para siempre', async () => {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const self = {
    location: { href: 'https://fontapp.net/sw.js', origin: 'https://fontapp.net' },
    addEventListener: () => {}, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {},
  }
  // Un `fetch` que no resuelve nunca, que es justo lo que hace una red muerta.
  let abortada = false
  const colgado = (_req: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_res, rej) => {
      init?.signal?.addEventListener('abort', () => { abortada = true; rej(new Error('AbortError')) })
    })
  const fn = new Function('self', 'caches', 'fetch', 'Response', 'clients',
    `${codigo}\n;return { fetchConTimeout };`)
  const sw = fn(self, {}, colgado, class {}, {})

  await assert.rejects(() => sw.fetchConTimeout({}, 20))
  assert.equal(abortada, true, 'tiene que abortar la petición, no solo dejar de esperarla')
})

/**
 * La navegación no puede quedarse en blanco esperando a una red que no responde.
 *
 * Es el mismo fallo que el de arriba, pero en el sitio donde duele: sin timeout, una
 * navegación con cobertura mala deja `respondWith` sin resolver y el navegador enseña la
 * **app entera en blanco**. Se reportó con una raya de 3G — y al poner modo avión todo
 * funcionó, que es la prueba: sin red el `fetch` falla al instante y se sirve el shell
 * guardado; con red mala no falla, solo espera.
 *
 * Se comprueba sobre el código, que es donde está la decisión: montar un `FetchEvent` de
 * mentira para provocarlo pediría media API del navegador simulada.
 */
test('la navegación se sirve con timeout, no con un fetch a pelo', () => {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const i = codigo.indexOf("req.mode === 'navigate'")
  assert.notEqual(i, -1, 'ya no existe la rama de navegación')
  const rama = codigo.slice(i, i + 1600)
  assert.match(rama, /fetchConTimeout\(req, NAV_TIMEOUT_MS\)/,
    'la navegación tiene que ir con timeout: sin él, con cobertura mala la app se queda en blanco')
  assert.doesNotMatch(rama, /respondWith\(\s*fetch\(req\)/,
    'un `fetch(req)` a pelo aquí es la pantalla en blanco que se reportó')
})

// --- Teselas: tope alto y caducidad ------------------------------------------------

/** Un Cache API de mentira, lo justo para preguntarle al SW qué borra y qué conserva. */
function cachesFalsos() {
  const almacen = new Map<string, Map<string, string>>()
  const abre = (n: string) => {
    if (!almacen.has(n)) almacen.set(n, new Map())
    const m = almacen.get(n)!
    return {
      keys: async () => [...m.keys()].map((url) => ({ url })),
      match: async (k: string) => (m.has(k) ? { text: async () => m.get(k) } : undefined),
      put: async (k: string, v: { _cuerpo?: string }) => void m.set(k, v._cuerpo ?? ''),
      delete: async (k: { url?: string } | string) =>
        void m.delete(typeof k === 'string' ? k : (k.url ?? '')),
    }
  }
  return {
    almacen,
    api: { open: async (n: string) => abre(n), delete: async (n: string) => void almacen.delete(n) },
  }
}

function cargaTeselas(c: ReturnType<typeof cachesFalsos>) {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const self = {
    location: { href: 'https://fontapp.net/sw.js', origin: 'https://fontapp.net' },
    addEventListener: () => {}, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {},
  }
  class R { _cuerpo: string; constructor(cuerpo = '') { this._cuerpo = String(cuerpo) } }
  const fn = new Function('self', 'caches', 'fetch', 'Response', 'clients',
    `${codigo}\n;return { caducaTeselas, trimCache, mide, vacia, VACIABLES, TILE_CACHE, TILE_STAMP, TILE_LIMIT, TILE_MAX_DIAS };`)
  return fn(self, c.api, () => {}, R, {})
}

test('el tope de teselas es alto: guardar el mapa es lo barato', () => {
  const sw = cargaTeselas(cachesFalsos())
  assert.equal(sw.TILE_LIMIT, 3000)
  assert.equal(sw.TILE_MAX_DIAS, 30)
})

test('la marca de fecha NO la borra el recorte', async () => {
  // Es la entrada más antigua del caché, así que el LRU se la llevaría la primera y la
  // caducidad no se dispararía jamás. Fallo perfectamente silencioso.
  const c = cachesFalsos()
  const sw = cargaTeselas(c)
  const m = new Map<string, string>([[sw.TILE_STAMP, '123']])
  for (let i = 0; i < 10; i++) m.set(`https://tile/${i}.png`, '')
  c.almacen.set(sw.TILE_CACHE, m)
  await sw.trimCache(sw.TILE_CACHE, 3)
  const quedan = [...c.almacen.get(sw.TILE_CACHE)!.keys()]
  assert.ok(quedan.includes(sw.TILE_STAMP), 'se ha borrado la marca')
  assert.equal(quedan.filter((k) => k !== sw.TILE_STAMP).length, 3)
})

test('las teselas caducan a los 30 días, y no antes', async () => {
  const c = cachesFalsos()
  const sw = cargaTeselas(c)
  const conFecha = (t: number) => {
    c.almacen.set(sw.TILE_CACHE, new Map([[sw.TILE_STAMP, String(t)], ['https://tile/1.png', '']]))
  }

  conFecha(Date.now() - 29 * 86400e3)
  await sw.caducaTeselas()
  assert.ok(c.almacen.get(sw.TILE_CACHE)!.has('https://tile/1.png'), 'a los 29 días no se tira nada')

  conFecha(Date.now() - 31 * 86400e3)
  await sw.caducaTeselas()
  const tras = c.almacen.get(sw.TILE_CACHE)!
  assert.ok(!tras.has('https://tile/1.png'), 'a los 31 días había que vaciarlo')
  assert.ok(tras.has(sw.TILE_STAMP), 'y reponer la marca, o caducaría en cada arranque')
})

test('sin marca se pone una y no se borra nada', async () => {
  // El caché que ya tiene la gente no lleva marca: tirárselo por eso sería empezar
  // castigando justo a quien lleva la app instalada desde antes.
  const c = cachesFalsos()
  const sw = cargaTeselas(c)
  c.almacen.set(sw.TILE_CACHE, new Map([['https://tile/1.png', '']]))
  await sw.caducaTeselas()
  const tras = c.almacen.get(sw.TILE_CACHE)!
  assert.ok(tras.has('https://tile/1.png'))
  assert.ok(Number(tras.get(sw.TILE_STAMP)) > Date.now() - 5000)
})

test('lo fijado no caduca con las teselas', async () => {
  const c = cachesFalsos()
  const sw = cargaTeselas(c)
  c.almacen.set('fontapp-pinned-v1', new Map([['https://tile/fijada.png', '']]))
  c.almacen.set(sw.TILE_CACHE, new Map([[sw.TILE_STAMP, String(Date.now() - 99 * 86400e3)]]))
  await sw.caducaTeselas()
  assert.ok(c.almacen.get('fontapp-pinned-v1')!.has('https://tile/fijada.png'))
})

// --- Vaciar el almacenamiento desde los ajustes ------------------------------------

test('el recuento cuenta claves y NO la marca de fecha', async () => {
  const c = cachesFalsos()
  const sw = cargaTeselas(c)
  c.almacen.set(sw.TILE_CACHE, new Map([[sw.TILE_STAMP, '1'], ['https://tile/1.png', '']]))
  c.almacen.set('fontapp-pinned-v1', new Map([['https://foto/1.jpg', '']]))
  const n = await sw.mide()
  assert.equal(n.teselas, 1, 'la marca no es una tesela y no se le enseña a nadie')
  assert.equal(n.fijado, 1)
  assert.equal(n.fotos, 0)
})

test('NO se puede vaciar el shell ni nada fuera de la lista blanca', async () => {
  // Vaciar el shell dejaría la app sin arrancar sin cobertura, que es justo lo contrario
  // de lo que hace esta pantalla. Y la bandeja de salida (aportaciones SIN ENVIAR) ni
  // siquiera es un caché: no hay forma de nombrarla desde aquí.
  const c = cachesFalsos()
  const sw = cargaTeselas(c)
  c.almacen.set('fontapp-shell-v7', new Map([['/index.html', '']]))
  for (const intento of ['shell', 'fontapp-shell-v7', '', 'outbox', '../shell']) {
    assert.deepEqual(await sw.vacia(intento), { vaciado: false }, `ha aceptado «${intento}»`)
  }
  assert.ok(c.almacen.has('fontapp-shell-v7'), 'se ha llevado el shell por delante')
  assert.deepEqual(Object.keys(sw.VACIABLES).sort(), ['api', 'fijado', 'fotos', 'teselas'])
})

test('vaciar una parte se lleva esa y solo esa', async () => {
  const c = cachesFalsos()
  const sw = cargaTeselas(c)
  c.almacen.set('fontapp-pinned-v1', new Map([['https://foto/1.jpg', '']]))
  c.almacen.set(sw.TILE_CACHE, new Map([['https://tile/1.png', '']]))
  assert.deepEqual(await sw.vacia('fijado'), { vaciado: true })
  assert.ok(!c.almacen.has('fontapp-pinned-v1'))
  assert.ok(c.almacen.has(sw.TILE_CACHE), 'no tenía que tocar las teselas')
})
