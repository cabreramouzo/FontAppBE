import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstFountainKind, NEARBY_KM } from '../src/lib/firstFountain.ts'

test('confirmed water nearby → gift, even if a closer fountain is dry/unknown', () => {
  assert.equal(firstFountainKind({ waterKm: 0.4, unknownKm: 0.1 }), 'gift')
})

test('no water nearby but an unchecked one is → mission', () => {
  assert.equal(firstFountainKind({ waterKm: null, unknownKm: 0.6 }), 'mission')
})

test('the dry-fountain bug: nearest is dry (so neither water nor unknown) → not mission', () => {
  // A fountain checked-and-dry is neither `waterKm` nor `unknownKm`; with nothing else
  // nearby the answer is explore, never the false "nobody has checked it".
  assert.equal(firstFountainKind({ waterKm: null, unknownKm: null }), 'explore')
})

test('water beyond NEARBY_KM does not count as a gift', () => {
  assert.equal(firstFountainKind({ waterKm: NEARBY_KM + 0.1, unknownKm: null }), 'explore')
})

test('an unchecked one beyond NEARBY_KM does not count as a mission', () => {
  assert.equal(firstFountainKind({ waterKm: null, unknownKm: NEARBY_KM + 0.1 }), 'explore')
})

test('exactly at the boundary counts as nearby', () => {
  assert.equal(firstFountainKind({ waterKm: NEARBY_KM, unknownKm: null }), 'gift')
  assert.equal(firstFountainKind({ waterKm: null, unknownKm: NEARBY_KM }), 'mission')
})
