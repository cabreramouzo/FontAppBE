import assert from 'node:assert/strict'
import test from 'node:test'
import { esFalloPorFaltaDeRed, esTrozoCaducado, recargaSiEsTrozoCaducado } from '../src/lib/staleChunk.ts'
import { readFileSync } from 'node:fs'

function conSession() {
  const datos = new Map<string, string>()
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v) },
    removeItem: (k: string) => { datos.delete(k) },
  }
  return datos
}

test('reconoce las tres formas en que los navegadores cuentan esto', () => {
  // Cada uno lo dice a su manera y no hay un tipo de error para distinguirlo.
  assert.ok(esTrozoCaducado(new TypeError('Failed to fetch dynamically imported module: https://x/a.js')))
  assert.ok(esTrozoCaducado(new Error('error loading dynamically imported module')))
  assert.ok(esTrozoCaducado(new Error(
    'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"')))
})

test('el caso de Cloudflare: el index.html servido como si fuera JS', () => {
  // Es lo que pasaba en produccion: el catch-all devolvia 200 con text/html.
  assert.ok(esTrozoCaducado(new SyntaxError("Unexpected token '<'")))
})

test('un error normal de la pantalla NO se confunde con esto', () => {
  // Si se confundiera, un fallo real se taparia con una recarga y volveria a fallar.
  assert.equal(esTrozoCaducado(new TypeError("Cannot read properties of null (reading 'foo')")), false)
  assert.equal(esTrozoCaducado(new Error('Rendered more hooks than during the previous render')), false)
  assert.equal(esTrozoCaducado(null), false)
  assert.equal(esTrozoCaducado('vaya'), false)
})

test('no recarga dos veces seguidas: eso seria un bucle', () => {
  conSession()
  let veces = 0
  const err = new Error('Failed to fetch dynamically imported module: /a.js')
  const t0 = 1_000_000
  assert.equal(recargaSiEsTrozoCaducado(err, t0, () => { veces += 1 }), true)
  assert.equal(recargaSiEsTrozoCaducado(err, t0 + 500, () => { veces += 1 }), false)
  assert.equal(veces, 1)
})

test('pero SI vuelve a recargar en un despliegue posterior', () => {
  // La primera version permitia una sola recarga por pestana, y quien deja la pestana
  // abierta un dia entero pasa por varios despliegues: a partir del segundo se le
  // ensenaba el error en vez de recargar. Lo que hay que evitar es el bucle —que
  // reaparece al instante— no recargar dos veces con horas de diferencia.
  conSession()
  let veces = 0
  const err = new Error('Failed to fetch dynamically imported module: /a.js')
  const t0 = 1_000_000
  recargaSiEsTrozoCaducado(err, t0, () => { veces += 1 })
  assert.equal(recargaSiEsTrozoCaducado(err, t0 + 3_600_000, () => { veces += 1 }), true, 'una hora despues')
  assert.equal(veces, 2)
})

test('un error normal no recarga nunca', () => {
  conSession()
  let veces = 0
  assert.equal(recargaSiEsTrozoCaducado(new Error('algo raro'), Date.now(), () => { veces += 1 }), false)
  assert.equal(veces, 0)
})

test('sin almacenamiento no se recarga, para no dejar la pantalla parpadeando', () => {
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: () => { throw new Error('bloqueado') },
    setItem: () => { throw new Error('bloqueado') },
  }
  let veces = 0
  assert.equal(recargaSiEsTrozoCaducado(new Error('Failed to fetch dynamically imported module'), Date.now(), () => { veces += 1 }), false)
  assert.equal(veces, 0)
})

/**
 * Sin cobertura y con un despliegue nuevo, el error es **el mismo**: en los dos casos el
 * trozo no llega. Pero la salida es la contraria — con un despliegue hay que recargar, y
 * sin red recargar deja a la persona sin ni siquiera lo que tenía en pantalla.
 *
 * Se reportó con una captura desde el monte: en modo avión, al entrar en una fuente salía
 * «la aplicación se ha actualizado, recarga para seguir».
 */
function conRed<T>(hayRed: boolean | null, f: () => T): T {
  // `defineProperty` y no una asignación: en Node 24 `globalThis.navigator` es un getter
  // y asignarle algo lanza «Cannot set property navigator of #<Object> which has only a
  // getter». Se restaura el descriptor original, sea cual sea.
  const previo = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  if (hayRed === null) delete (globalThis as { navigator?: unknown }).navigator
  else Object.defineProperty(globalThis, 'navigator', { value: { onLine: hayRed }, configurable: true })
  try {
    return f()
  } finally {
    if (previo) Object.defineProperty(globalThis, 'navigator', previo)
    else delete (globalThis as { navigator?: unknown }).navigator
  }
}

const falloDeTrozo = new TypeError('Failed to fetch dynamically imported module: /assets/x.js')

test('sin cobertura, un trozo que no llega NO es «la app se ha actualizado»', () => {
  assert.equal(conRed(false, () => esFalloPorFaltaDeRed(falloDeTrozo)), true)
})

test('con cobertura, el mismo error sigue siendo un despliegue nuevo', () => {
  assert.equal(conRed(true, () => esFalloPorFaltaDeRed(falloDeTrozo)), false)
  assert.equal(conRed(true, () => esTrozoCaducado(falloDeTrozo)), true)
})

test('un error normal no se confunde con falta de red aunque no haya cobertura', () => {
  // Si se confundiera, un fallo de verdad se disfrazaría de «no hay señal» y nadie lo
  // buscaría nunca.
  assert.equal(conRed(false, () => esFalloPorFaltaDeRed(new TypeError('undefined is not an object'))), false)
})

test('las pantallas que precargamos son las que sirven sin red', () => {
  // Precargar las demás sería gastar los datos de alguien para que le salga un error más
  // bonito: zonas, novedades y perfil no funcionan sin servidor.
  const codigo = readFileSync(new URL('../src/lib/precargaRutas.ts', import.meta.url), 'utf8')
  assert.match(codigo, /pages\/FontDetailPage/)
  assert.match(codigo, /pages\/RouteWaterPage/)
  assert.doesNotMatch(codigo, /pages\/(ZonesPage|NewsPage|ProfilePage|AdminPage)/)
})

test('sin `navigator` no se da por sin red, se sigue como siempre', () => {
  assert.equal(conRed(null, () => esFalloPorFaltaDeRed(falloDeTrozo)), false)
})
