import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * El caché fijado: lo que se guarda a salvo del descarte por orden de llegada.
 *
 * Se prueba con el mismo truco que el enrutado: cargar el `sw.js` con un `self` y unos
 * `caches` de mentira y preguntarle por sus decisiones. No se puede registrar un service
 * worker en un test, pero esto es lógica pura y es donde están los fallos que no dan la
 * cara.
 */
class RespuestaFalsa {
  body: string
  init?: { status?: number; headers?: Record<string, string> }
  constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
    this.body = body
    this.init = init
  }
}

function cargaSW(
  cachesFalsos: Record<string, Map<string, unknown>>,
  idioma = 'ca',
  fetchFalso: (input: unknown, init?: { mode?: string }) => Promise<unknown> =
    async () => ({ ok: true, clone: () => 'nueva' }),
) {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const abiertos = new Set<string>()
  const caches = {
    open: async (nombre: string) => {
      abiertos.add(nombre)
      cachesFalsos[nombre] ??= new Map()
      const m = cachesFalsos[nombre]
      return {
        match: async (req: unknown) => m.get(String(req)),
        put: async (req: unknown, res: unknown) => { m.set(String(req), res) },
        delete: async (req: unknown) => m.delete(String(req)),
        // El Cache API de verdad devuelve `Request`s, no cadenas: el recorte mira
        // `k.url` para no borrar la marca de fecha de las teselas, y con cadenas pelás
        // este doble mentiría sobre la forma del dato.
        keys: async () => [...m.keys()].map((url) => ({ url, toString: () => url })),
      }
    },
    keys: async () => Object.keys(cachesFalsos),
    delete: async (n: string) => { delete cachesFalsos[n]; return true },
  }
  const self = {
    location: { href: 'https://fontapp.net/sw.js', origin: 'https://fontapp.net' },
    navigator: { language: idioma },
    addEventListener: () => {}, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {},
  }
  const fn = new Function('self', 'caches', 'fetch', 'Response', 'clients',
    `${codigo}\n;return { buscaFijadoPrimero, trimCache, fija, paginaSinConexion, SIN_CONEXION, PINNED_CACHE, API_CACHE, PHOTO_CACHE, API_LIMIT };`)
  return { sw: fn(self, caches, fetchFalso, RespuestaFalsa, {}), abiertos }
}

test('lo fijado gana a lo normal, aunque los dos estén guardados', () => {
  const datos: Record<string, Map<string, unknown>> = {}
  const { sw } = cargaSW(datos)
  datos[sw.PINNED_CACHE] = new Map([['/fonts/in-bounds?x', 'FIJADA']])
  datos[sw.API_CACHE] = new Map([['/fonts/in-bounds?x', 'normal']])
  return sw.buscaFijadoPrimero('/fonts/in-bounds?x', sw.API_CACHE).then((r: { hit: unknown; destino: string }) => {
    assert.equal(r.hit, 'FIJADA')
    // El destino importa tanto como el acierto: si al revalidar se escribiera en el caché
    // normal, el descarte se llevaría la copia fijada y fijar no habría servido de nada.
    assert.equal(r.destino, sw.PINNED_CACHE)
  })
})

test('sin nada fijado se usa el caché de siempre', async () => {
  const datos: Record<string, Map<string, unknown>> = {}
  const { sw } = cargaSW(datos)
  datos[sw.API_CACHE] = new Map([['/activity', 'normal']])
  const r = await sw.buscaFijadoPrimero('/activity', sw.API_CACHE)
  assert.equal(r.hit, 'normal')
  assert.equal(r.destino, sw.API_CACHE)
})

test('el recorte NUNCA toca el caché fijado', async () => {
  const datos: Record<string, Map<string, unknown>> = {}
  const { sw } = cargaSW(datos)
  datos[sw.PINNED_CACHE] = new Map([['a', 1], ['b', 2], ['c', 3]])
  // Se recorta el de la API a cero: lo fijado tiene que seguir entero.
  datos[sw.API_CACHE] = new Map([['x', 1], ['y', 2]])
  await sw.trimCache(sw.API_CACHE, 1)
  assert.equal(datos[sw.PINNED_CACHE].size, 3, 'el descarte se ha llevado algo fijado')
  // Se comprueba el tope y no un número exacto: el recorte baja por DEBAJO del máximo a
  // propósito (histéresis), para no volver a enumerar el caché en el guardado siguiente.
  assert.ok(datos[sw.API_CACHE].size <= 1, `quedan ${datos[sw.API_CACHE].size}`)
})

test('fijar guarda en el caché fijado y dice cuántas y cuánto ocupan', async () => {
  const datos: Record<string, Map<string, unknown>> = {}
  const { sw } = cargaSW(datos)
  const r = await sw.fija(['/fonts/in-bounds?a', '/fonts/in-bounds?b']) as { guardadas: number; bytes: number }
  assert.equal(r.guardadas, 2)
  assert.equal(datos[sw.PINNED_CACHE].size, 2)
  // Los bytes son informativos: si no se pueden medir se queda en 0, nunca en `undefined`,
  // porque esa cifra acaba pintada en una pantalla.
  assert.equal(typeof r.bytes, 'number')
})

test('una foto externa sin CORS se pide como no-cors y se guarda aunque sea opaca', async () => {
  const datos: Record<string, Map<string, unknown>> = {}
  let modo = ''
  const opaca = {
    ok: false,
    type: 'opaque',
    redirected: false,
    clone: () => opaca,
  }
  const { sw } = cargaSW(datos, 'ca', async (_input, init) => {
    modo = init?.mode ?? ''
    return opaca
  })
  const url = 'https://pub-ejemplo.r2.dev/uploads/foto.jpg'
  const r = await sw.fija([url]) as { guardadas: number; bytes: number }
  assert.equal(modo, 'no-cors')
  assert.equal(r.guardadas, 1)
  assert.equal(r.bytes, 0, 'el cuerpo opaco no se puede medir, pero sí guardar')
  assert.equal(datos[sw.PINNED_CACHE].get(url), opaca)
})

test('las fotos y los datos ya no comparten hueco', () => {
  // Compartían los 300 del mismo caché, así que mover el mapa unas decenas de veces
  // echaba todas las fotos guardadas, y al revés.
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(codigo, /const PHOTO_CACHE = 'fontapp-photos-v1'/)
  assert.match(codigo, /cacheFirst\(req, PHOTO_CACHE/)
  assert.doesNotMatch(codigo, /cacheFirst\(req, API_CACHE/)
})

test('la pantalla de sin conexión está en los ocho idiomas y trae reintento', () => {
  // Era un `<h1>Sense connexió</h1>` pelado: catalán a la fuerza, sin estilos y **sin
  // JavaScript**, así que al volver la cobertura se quedaba ahí para siempre. Se reportó
  // desde el monte con una captura, y parecía un fallo de la app.
  const { sw } = cargaSW({})
  const idiomas = Object.keys(sw.SIN_CONEXION as Record<string, string[]>)
  assert.deepEqual(idiomas.sort(), ['ca', 'en', 'es', 'eu', 'fr', 'gl', 'it', 'pt'])
  for (const [k, v] of Object.entries(sw.SIN_CONEXION as Record<string, string[]>)) {
    assert.equal(v.length, 3, `${k}: título, texto y botón`)
    for (const t of v) assert.ok(t.trim().length > 0, `${k}: hay una cadena vacía`)
  }
})

test('la pantalla de sin conexión se recarga sola al volver la red', () => {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  // Sin esto no hay app que escuche: la pantalla se queda para siempre aunque el móvil
  // ya tenga cobertura, que es la mitad del fallo que se reportó.
  assert.match(codigo, /addEventListener\('online'/)
  assert.match(codigo, /visibilitychange/)
})

test('el respaldo de navegación mira las DOS claves del shell', () => {
  // `precargaShell` guarda bajo `/` y `/index.html`. Mirando solo la segunda, una app con
  // su shell guardado podía acabar enseñando la pantalla de sin conexión igualmente.
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(codigo, /c\.match\('\/index\.html'\)\) \|\| \(await c\.match\('\/'\)/)
})

test('el shell se repone al activar si falta', () => {
  // `precargaShell` solo corría en `install`: una instalación con la red a medias dejaba
  // la app sin shell PARA SIEMPRE — todo bien con cobertura, y al perderla, pantalla
  // pelada. Ahora se comprueba en cada arranque del worker.
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const activate = codigo.slice(codigo.indexOf("addEventListener('activate'"))
  assert.match(activate.slice(0, 900), /precargaShell\(\)/)
})

test('la pantalla sale en el idioma del móvil, no siempre en catalán', () => {
  for (const [idioma, esperado] of [['es', 'Sin conexión'], ['en', 'No connection'], ['it', 'Senza connessione']] as const) {
    const { sw } = cargaSW({}, idioma)
    const res = sw.paginaSinConexion() as { body: string; init?: { status?: number } }
    assert.ok(res.body.includes(`<h1>${esperado}</h1>`), `${idioma}: esperaba «${esperado}»`)
    assert.equal(res.init?.status, 503)
  }
})

test('un idioma que no tenemos cae en catalán en vez de quedarse en blanco', () => {
  const { sw } = cargaSW({}, 'de-DE')
  const res = sw.paginaSinConexion() as { body: string }
  assert.ok(res.body.includes('<h1>Sense connexió</h1>'))
})

test('la pantalla trae estilos y botón, no un <h1> pelado', () => {
  // Lo que se reportó desde el monte era literalmente `<h1>Sense connexió</h1>`: fuente
  // serif del navegador, sin nada más.
  const { sw } = cargaSW({}, 'es')
  const res = sw.paginaSinConexion() as { body: string }
  assert.match(res.body, /<style>/)
  assert.match(res.body, /prefers-color-scheme:\s*dark/, 'tiene que seguir el tema del móvil')
  assert.match(res.body, /<button[^>]*>Reintentar<\/button>/)
  assert.match(res.body, /viewport/, 'sin viewport, en un móvil sale diminuta')
})

test('el respaldo de navegación USA esa pantalla y no un <h1> pelado', () => {
  // Los tests de arriba llaman a la función directamente: sin éste, volver al `<h1>`
  // dentro del manejador pasaría desapercibido. Comprobado rompiéndolo.
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(codigo, /return hit \|\| paginaSinConexion\(\)/)
  assert.doesNotMatch(codigo, /new Response\('<h1>/)
})
