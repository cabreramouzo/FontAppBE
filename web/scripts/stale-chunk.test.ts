import assert from 'node:assert/strict'
import test from 'node:test'
import { esTrozoCaducado, recargaSiEsTrozoCaducado } from '../src/lib/staleChunk.ts'

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

test('recarga una vez, y solo una', () => {
  conSession()
  let veces = 0
  const err = new Error('Failed to fetch dynamically imported module: /a.js')
  assert.equal(recargaSiEsTrozoCaducado(err, () => { veces += 1 }), true)
  assert.equal(recargaSiEsTrozoCaducado(err, () => { veces += 1 }), false, 'la segunda no: seria un bucle')
  assert.equal(veces, 1)
})

test('un error normal no recarga nunca', () => {
  conSession()
  let veces = 0
  assert.equal(recargaSiEsTrozoCaducado(new Error('algo raro'), () => { veces += 1 }), false)
  assert.equal(veces, 0)
})

test('sin almacenamiento no se recarga, para no dejar la pantalla parpadeando', () => {
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: () => { throw new Error('bloqueado') },
    setItem: () => { throw new Error('bloqueado') },
  }
  let veces = 0
  assert.equal(recargaSiEsTrozoCaducado(new Error('Failed to fetch dynamically imported module'), () => { veces += 1 }), false)
  assert.equal(veces, 0)
})
