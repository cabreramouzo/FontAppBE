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
function cargaSW(cachesFalsos: Record<string, Map<string, unknown>>) {
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
        keys: async () => [...m.keys()],
      }
    },
    keys: async () => Object.keys(cachesFalsos),
    delete: async (n: string) => { delete cachesFalsos[n]; return true },
  }
  const self = {
    location: { href: 'https://fontapp.net/sw.js', origin: 'https://fontapp.net' },
    addEventListener: () => {}, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {},
  }
  const fn = new Function('self', 'caches', 'fetch', 'Response', 'clients',
    `${codigo}\n;return { buscaFijadoPrimero, trimCache, fija, PINNED_CACHE, API_CACHE, PHOTO_CACHE, API_LIMIT };`)
  return { sw: fn(self, caches, async () => ({ ok: true, clone: () => 'nueva' }), class {}, {}), abiertos }
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
  assert.equal(datos[sw.API_CACHE].size, 1)
})

test('fijar guarda en el caché fijado y dice cuántas', async () => {
  const datos: Record<string, Map<string, unknown>> = {}
  const { sw } = cargaSW(datos)
  const n = await sw.fija(['/fonts/in-bounds?a', '/fonts/in-bounds?b'])
  assert.equal(n, 2)
  assert.equal(datos[sw.PINNED_CACHE].size, 2)
})

test('las fotos y los datos ya no comparten hueco', () => {
  // Compartían los 300 del mismo caché, así que mover el mapa unas decenas de veces
  // echaba todas las fotos guardadas, y al revés.
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(codigo, /const PHOTO_CACHE = 'fontapp-photos-v1'/)
  assert.match(codigo, /cacheFirst\(req, PHOTO_CACHE/)
  assert.doesNotMatch(codigo, /cacheFirst\(req, API_CACHE/)
})
