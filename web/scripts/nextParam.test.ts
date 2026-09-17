import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeNext, loginNext, withNext } from '../src/lib/nextParam.ts'

test('devuelve una ruta interna válida', () => {
  assert.equal(safeNext('?next=/fonts/abc'), '/fonts/abc')
  assert.equal(safeNext('?next=%2Ffonts%2Fabc'), '/fonts/abc')
})

test('sin next, null', () => {
  assert.equal(safeNext(''), null)
  assert.equal(safeNext('?otra=1'), null)
})

test('rechaza open redirects', () => {
  assert.equal(safeNext('?next=//evil.com'), null, 'protocolo-relativa a otro host')
  assert.equal(safeNext('?next=%2F%2Fevil.com'), null, 'protocolo-relativa CODIFICADA (el bypass clásico)')
  assert.equal(safeNext('?next=/\\evil.com'), null, 'barra invertida a otro host')
  assert.equal(safeNext('?next=%2F%5Cevil.com'), null, 'barra invertida codificada')
  assert.equal(safeNext('?next=https://evil.com'), null, 'esquema absoluto')
  assert.equal(safeNext('?next=javascript:alert(1)'), null, 'no empieza por /')
})

test('la raíz es un destino válido', () => {
  assert.equal(safeNext('?next=/'), '/')
})

test('loginNext codifica el destino', () => {
  assert.equal(loginNext('/fonts/x?y=1'), '/login?next=%2Ffonts%2Fx%3Fy%3D1')
})

test('withNext solo añade si hay destino', () => {
  assert.equal(withNext('/register', '/fonts/x'), '/register?next=%2Ffonts%2Fx')
  assert.equal(withNext('/register', null), '/register')
})
