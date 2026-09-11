import assert from 'node:assert/strict'
import { test } from 'node:test'
import { puedoConfirmarMiReseña, COOLDOWN_AUTOCONFIRMACION_MS as COOLDOWN } from '../src/lib/selfConfirm.ts'

/**
 * Enseñar el botón «sigue igual» sobre la reseña propia solo cuando el servidor lo va a
 * aceptar. Antes se escondía siempre y no se podía refrescar una fuente reseñada por ti
 * hace tiempo; enseñarlo sin la regla daría un 403 al tocarlo.
 */
const AHORA = Date.parse('2026-09-12T12:00:00Z')
const iso = (ms: number) => new Date(AHORA - ms).toISOString()

test('reseña propia de hace un mes: se puede volver a confirmar', () => {
  assert.equal(puedoConfirmarMiReseña(iso(30 * 24 * 3600 * 1000), null, AHORA), true)
})

test('reseña propia de hace unas horas: todavía no', () => {
  assert.equal(puedoConfirmarMiReseña(iso(3 * 3600 * 1000), null, AHORA), false)
})

test('manda la más reciente entre reseña y última confirmación', () => {
  // Reseñada hace un mes pero confirmada hace 2 h: aún no.
  assert.equal(puedoConfirmarMiReseña(iso(30 * 24 * 3600 * 1000), iso(2 * 3600 * 1000), AHORA), false)
  // Reseñada hace un mes y confirmada hace 2 días: sí.
  assert.equal(puedoConfirmarMiReseña(iso(30 * 24 * 3600 * 1000), iso(2 * 24 * 3600 * 1000), AHORA), true)
})

test('justo en el límite del enfriamiento', () => {
  assert.equal(puedoConfirmarMiReseña(iso(COOLDOWN), null, AHORA), true)
  assert.equal(puedoConfirmarMiReseña(iso(COOLDOWN - 1000), null, AHORA), false)
})

test('sin fechas no bloquea (decide el servidor)', () => {
  assert.equal(puedoConfirmarMiReseña(null, null, AHORA), true)
})
