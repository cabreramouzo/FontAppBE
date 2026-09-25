import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FIX_MAX_AGE_MS, kmLabel, rememberRemoteConfirmed, remoteAlreadyConfirmed, remoteDistanceM,
  roundDistance, type Fix,
} from '../src/lib/remoteReview.ts'

// A fountain in Moià. 0.01° of latitude ≈ 1.11 km.
const FONT = { latitude: 41.81, longitude: 2.10 }
const NOW = 1_800_000_000_000
const at = (dLat: number, accuracy = 20, ageMs = 0): Fix =>
  ({ lat: FONT.latitude + dLat, long: FONT.longitude, accuracy, t: NOW - ageMs })

test('standing at the fountain is not remote', () => {
  assert.equal(remoteDistanceM(at(0), FONT, NOW), null)
  assert.equal(remoteDistanceM(at(0.005), FONT, NOW), null) // ~560 m: walked on a bit
})

test('clearly far away is remote, with the distance rounded', () => {
  const d = remoteDistanceM(at(0.1), FONT, NOW) // ~11.1 km
  assert.equal(d, 11_000)
  assert.equal(remoteDistanceM(at(0.02), FONT, NOW), 2_200) // ~2.22 km → 100 m steps
})

test('the fix accuracy is given as benefit of the doubt', () => {
  // ~1.45 km away, but ±600 m: could be under a kilometre → not remote.
  assert.equal(remoteDistanceM(at(0.013, 600), FONT, NOW), null)
  // Same distance with a good GPS fix → remote.
  assert.notEqual(remoteDistanceM(at(0.013, 15), FONT, NOW), null)
})

test('a vague position (Wi-Fi / cell) is ignored, however far it says', () => {
  assert.equal(remoteDistanceM(at(0.5, 1500), FONT, NOW), null)
})

test('no position, or an old one, means nothing is asked', () => {
  assert.equal(remoteDistanceM(null, FONT, NOW), null)
  assert.equal(remoteDistanceM(at(0.1, 20, FIX_MAX_AGE_MS + 1), FONT, NOW), null)
})

test('only an approximate distance is kept', () => {
  assert.equal(roundDistance(1_449), 1_400)
  assert.equal(roundDistance(9_951), 10_000)
  assert.equal(roundDistance(123_456), 123_000)
})

test('kilometres as shown to the person', () => {
  assert.equal(kmLabel(1_400), '1.4')
  assert.equal(kmLabel(2_000), '2')
  assert.equal(kmLabel(11_000), '11')
  assert.equal(kmLabel(1_400, 'ca'), '1,4') // the reader's decimal separator
})

test('the question is asked once per fountain', () => {
  assert.equal(remoteAlreadyConfirmed('abc'), false)
  rememberRemoteConfirmed('abc')
  assert.equal(remoteAlreadyConfirmed('abc'), true)
  assert.equal(remoteAlreadyConfirmed('other'), false)
})
