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
    `${codigo}\n;return { isTile, isAPI, API_ORIGIN, peticionDeSalida, imagenDe };`)
  return fn(self, {}, () => {}, class {}, {})
}

test('el shell actual invalida el bundle persistente anterior', () => {
  const codigo = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(codigo, /const SHELL_CACHE = 'fontapp-shell-v7'/)
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
