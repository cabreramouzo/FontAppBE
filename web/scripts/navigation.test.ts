import test from 'node:test'
import assert from 'node:assert/strict'
import { mainSection } from '../src/lib/navigation.ts'

test('mantiene seleccionada la sección en sus pantallas secundarias', () => {
  assert.equal(mainSection('/'), 'map')
  assert.equal(mainSection('/fonts/abc'), 'map')
  assert.equal(mainSection('/activity'), 'activity')
  assert.equal(mainSection('/zones'), 'zones')
  assert.equal(mainSection('/me/badges'), 'profile')
  assert.equal(mainSection('/me/settings'), 'profile')
  assert.equal(mainSection('/gamification'), 'profile')
})

test('el acceso pertenece a perfil y las acciones no simulan ser pestañas', () => {
  assert.equal(mainSection('/login'), 'profile')
  assert.equal(mainSection('/register'), 'profile')
  assert.equal(mainSection('/support'), null)
  assert.equal(mainSection('/install'), null)
})
