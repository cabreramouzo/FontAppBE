import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixValido, MAX_EDAD_DIAS } from '../src/lib/lastFix.ts'

/**
 * El último fix guardado, para el punto atenuado al abrir. Se valida al leer porque un
 * `lat` que sea texto no da error: da distancias absurdas mucho después, y entonces el
 * fallo parece del cálculo y no del dato (misma lección que la ruta recordada).
 */
const AHORA = 1_000_000_000_000
const dias = (n: number) => n * 24 * 60 * 60 * 1000

test('un fix reciente y en rango se acepta', () => {
  assert.deepEqual(fixValido({ lat: 41.7, lng: 2.1, t: AHORA - dias(1) }, AHORA), [41.7, 2.1])
})

test('coordenadas que son texto o no finitas se rechazan', () => {
  assert.equal(fixValido({ lat: '41.7', lng: 2.1, t: AHORA }, AHORA), null)
  assert.equal(fixValido({ lat: NaN, lng: 2.1, t: AHORA }, AHORA), null)
  assert.equal(fixValido({ lat: 41.7, lng: Infinity, t: AHORA }, AHORA), null)
})

test('coordenadas fuera de rango se rechazan', () => {
  assert.equal(fixValido({ lat: 91, lng: 2, t: AHORA }, AHORA), null)
  assert.equal(fixValido({ lat: 0, lng: 181, t: AHORA }, AHORA), null)
})

test('un fix demasiado viejo se descarta (podrías estar en otra ciudad)', () => {
  assert.equal(fixValido({ lat: 41, lng: 2, t: AHORA - dias(MAX_EDAD_DIAS + 1) }, AHORA), null)
  // justo dentro del tope sí vale
  assert.deepEqual(fixValido({ lat: 41, lng: 2, t: AHORA - dias(MAX_EDAD_DIAS - 1) }, AHORA), [41, 2])
})

test('un timestamp en el futuro (reloj hacia atrás) se rechaza', () => {
  assert.equal(fixValido({ lat: 41, lng: 2, t: AHORA + dias(1) }, AHORA), null)
})

test('basura (null, sin campos) no rompe, devuelve null', () => {
  assert.equal(fixValido(null, AHORA), null)
  assert.equal(fixValido({}, AHORA), null)
  assert.equal(fixValido('nope', AHORA), null)
})
