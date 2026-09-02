import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstFountainKind, NEARBY_KM } from '../src/lib/firstFountain.ts'

const near = (o: Partial<{ waterKm: number | null; unknownKm: number | null; anyKm: number | null }>) =>
  ({ waterKm: null, unknownKm: null, anyKm: null, ...o })

test('confirmed water nearby → gift, even if a closer fountain is dry/unknown', () => {
  assert.equal(firstFountainKind(near({ waterKm: 0.4, unknownKm: 0.1, anyKm: 0.1 })), 'gift')
})

test('no water nearby but an unchecked one is → mission', () => {
  assert.equal(firstFountainKind(near({ unknownKm: 0.6, anyKm: 0.6 })), 'mission')
})

test('the dry-fountain case: fountains nearby but all checked-and-dry → dry, not mission', () => {
  // Nearest is dry (so neither waterKm nor unknownKm), but a fountain IS there.
  assert.equal(firstFountainKind(near({ anyKm: 0.5 })), 'dry')
})

test('no fountains at all nearby → explore', () => {
  assert.equal(firstFountainKind(near({})), 'explore')
})

test('everything beyond NEARBY_KM → explore', () => {
  assert.equal(firstFountainKind(near({ waterKm: NEARBY_KM + 0.1, anyKm: NEARBY_KM + 0.1 })), 'explore')
})

test('exactly at the boundary counts as nearby', () => {
  assert.equal(firstFountainKind(near({ waterKm: NEARBY_KM, anyKm: NEARBY_KM })), 'gift')
  assert.equal(firstFountainKind(near({ unknownKm: NEARBY_KM, anyKm: NEARBY_KM })), 'mission')
  assert.equal(firstFountainKind(near({ anyKm: NEARBY_KM })), 'dry')
})
