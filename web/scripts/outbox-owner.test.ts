import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * De quién es cada cosa de la cola.
 *
 * La lógica vive dentro de `lib/outbox.ts`, que toca IndexedDB y no se puede importar
 * desde Node. Se prueba aquí la regla pura, que es donde estaba el fallo: una aportación
 * guardada con una cuenta **se publicaba con la que estuviera puesta al enviarla**.
 * Pasó de verdad — una reseña encolada sin cobertura con la cuenta de administrador
 * esperando a salir firmada por quien no era.
 */
function esMia(item: { userID?: string }, yo: string | undefined): boolean {
  return !item.userID || item.userID === yo
}

test('lo tuyo sale y lo de otra cuenta se queda esperando', () => {
  assert.equal(esMia({ userID: 'ana' }, 'ana'), true)
  assert.equal(esMia({ userID: 'admin' }, 'ana'), false)
})

test('lo guardado ANTES de esto sigue saliendo', () => {
  // Las que ya estaban en la cola no llevan dueño. Bloquearlas sería dejar tiradas
  // aportaciones reales de gente que no ha hecho nada raro, y no hay forma de saber de
  // quién eran.
  assert.equal(esMia({}, 'ana'), true)
  assert.equal(esMia({}, undefined), true)
})

test('sin sesión no se envía lo que tiene dueño', () => {
  // Sin sesión no hay token con el que firmar; y si lo hubiera, sería de otro.
  assert.equal(esMia({ userID: 'ana' }, undefined), false)
})
