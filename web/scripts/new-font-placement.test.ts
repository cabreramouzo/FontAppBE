import assert from 'node:assert/strict'
import test from 'node:test'
import { isRemotePlacement, newFontPosition } from '../src/lib/newFontPlacement.ts'

test('cerca de la persona, añadir usa el GPS', () => {
  const me = { lat: 41.7600, lng: 2.1500 }
  const center = { lat: 41.7605, lng: 2.1505 }
  assert.deepEqual(newFontPosition(center, me), me)
  assert.equal(isRemotePlacement(me, me), false)
})

test('después de buscar una ruta lejana, añadir usa el centro del mapa', () => {
  const home = { lat: 41.7600, lng: 2.1500 }
  const searchedRoute = { lat: 42.6333, lng: 0.6500 }
  assert.deepEqual(newFontPosition(searchedRoute, home), searchedRoute)
  assert.equal(isRemotePlacement(searchedRoute, home), true)
})

test('sin permiso de ubicación, se respeta el mapa que la persona está mirando', () => {
  const center = { lat: 40.4168, lng: -3.7038 }
  assert.deepEqual(newFontPosition(center, null), center)
})
