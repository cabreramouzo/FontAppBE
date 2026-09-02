import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstFountainKind, NEARBY_KM } from '../src/lib/firstFountain.ts'

test('no fountains at all → explore, never a promise we cannot keep', () => {
  assert.equal(firstFountainKind(null), 'explore')
})

test('the nearest is beyond NEARBY_KM → explore, not "go for a 44 km walk"', () => {
  assert.equal(firstFountainKind({ distanceKm: 44, hasWaterNow: false }), 'explore')
  // Even confirmed water does not rescue it if it is too far to be "nearby".
  assert.equal(firstFountainKind({ distanceKm: NEARBY_KM + 0.1, hasWaterNow: true }), 'explore')
})

test('nearby and confirmed flowing → gift (pure value, ask for nothing)', () => {
  assert.equal(firstFountainKind({ distanceKm: 0.24, hasWaterNow: true }), 'gift')
})

test('nearby but not confirmed (never checked or stale) → mission, the strongest hook', () => {
  assert.equal(firstFountainKind({ distanceKm: 0.6, hasWaterNow: false }), 'mission')
})

test('exactly at the boundary counts as nearby', () => {
  assert.equal(firstFountainKind({ distanceKm: NEARBY_KM, hasWaterNow: false }), 'mission')
})
