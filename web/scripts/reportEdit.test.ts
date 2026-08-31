import assert from 'node:assert/strict'
import { test } from 'node:test'
import { puedeEditar, VENTANA_EDICION_MS } from '../src/lib/reportEdit.ts'

const AHORA = Date.parse('2026-09-01T12:00:00Z')
const hace = (ms: number) => new Date(AHORA - ms).toISOString()
const YO = 'u1'

test('el autor puede corregir dentro de la hora', () => {
  assert.equal(puedeEditar({ userID: YO, createdAt: hace(10 * 60 * 1000) }, YO, AHORA), true)
})

test('pasada la hora ya no, que es lo que hace que la ventana signifique algo', () => {
  assert.equal(puedeEditar({ userID: YO, createdAt: hace(VENTANA_EDICION_MS + 1000) }, YO, AHORA), false)
})

test('lo que escribió otro no se toca, ni recién escrito', () => {
  assert.equal(puedeEditar({ userID: 'otro', createdAt: hace(0) }, YO, AHORA), false)
})

test('sin sesión no se ofrece nada', () => {
  assert.equal(puedeEditar({ userID: YO, createdAt: hace(0) }, null, AHORA), false)
})

test('una fecha ilegible o futura no abre la ventana', () => {
  assert.equal(puedeEditar({ userID: YO, createdAt: 'ayer' }, YO, AHORA), false)
  // Reloj del móvil adelantado: sin la comprobación, «transcurrido» sale negativo y
  // pasaría el corte por abajo para siempre.
  assert.equal(puedeEditar({ userID: YO, createdAt: hace(-5 * 60 * 1000) }, YO, AHORA), false)
})
