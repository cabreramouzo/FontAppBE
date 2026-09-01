import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueoDe } from '../src/lib/capabilityNotice.ts'

const grant = (o: Partial<{ capabilities: string[]; blockedBy: string[]; activeDays: number; requiredActiveDays: number }> = {}) => ({
  capabilities: [], blockedBy: [], ...o,
}) as never

test('quien ya puede no ve ningún aviso', () => {
  assert.equal(bloqueoDe('addSecondaryPhoto', grant({ capabilities: ['addSecondaryPhoto'] })), null)
})

test('mientras carga no se afirma nada', () => {
  assert.equal(bloqueoDe('addSecondaryPhoto', undefined), null)
})

test('con el nivel de sobra pero pocos días, el aviso son los días', () => {
  // El caso reportado: 3.949 gotas y 2 días. El aviso decía «necesitas el nivel Rierol».
  const b = bloqueoDe('addSecondaryPhoto', grant({ blockedBy: ['activeDays'], activeDays: 2, requiredActiveDays: 8 }))
  assert.equal(b?.clave, 'cap.blocked.activeDays')
  assert.deepEqual(b?.params, { have: 2, need: 8 })
})

test('lo que no se arregla aportando manda sobre lo que sí', () => {
  assert.equal(bloqueoDe('x', grant({ blockedBy: ['restricted', 'activeDays'] }))?.clave, 'cap.blocked.restricted')
})

test('la gamificación apagada es un motivo, no un cargando', () => {
  assert.equal(bloqueoDe('x', null)?.clave, 'cap.blocked.optedOut')
})

test('sin ningún otro motivo, el que falta es el nivel', () => {
  assert.equal(bloqueoDe('x', grant({ blockedBy: ['gotes'] }))?.clave, 'cap.needLevel')
})
