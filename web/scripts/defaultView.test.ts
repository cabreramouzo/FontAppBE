import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_VIEW, defaultViewFor } from '../src/lib/mapView.ts'

test('unknown or missing time zone keeps the old Madrid view', () => {
  assert.deepEqual(defaultViewFor(undefined), DEFAULT_VIEW)
  assert.deepEqual(defaultViewFor('Asia/Kolkata'), DEFAULT_VIEW)
  assert.deepEqual(defaultViewFor('Europe/Madrid'), DEFAULT_VIEW)
})

test('a viewer in Latin America opens on their own country', () => {
  const mx = defaultViewFor('America/Mexico_City')
  assert.ok(mx.lat > 14 && mx.lat < 33 && mx.lng < -86, 'Mexico')
  assert.deepEqual(defaultViewFor('America/Monterrey'), mx) // one country, many zones
  const ar = defaultViewFor('America/Argentina/Cordoba')
  assert.ok(ar.lat < -20 && ar.lng < -53, 'Argentina')
  assert.deepEqual(defaultViewFor('America/Buenos_Aires'), ar) // legacy alias
  const br = defaultViewFor('America/Manaus')
  assert.ok(br.lat < 6 && br.lng > -74 && br.lng < -34, 'Brazil')
  assert.deepEqual(defaultViewFor('America/Punta_Arenas'), defaultViewFor('America/Santiago'))
})

test('a similar-looking zone outside our countries is not guessed', () => {
  assert.deepEqual(defaultViewFor('Africa/Nairobi'), DEFAULT_VIEW)
  assert.deepEqual(defaultViewFor('America/Sao_Paulo_X'), DEFAULT_VIEW)
})
