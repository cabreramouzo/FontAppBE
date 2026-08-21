import test from 'node:test'
import assert from 'node:assert/strict'
import { confidenceOf } from '../src/lib/confidence.ts'

const now = Date.parse('2026-08-21T12:00:00Z')
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString()

test('sin un estado comprobado nunca presume confianza', () => {
  assert.equal(confidenceOf({}, now), 'unverified')
})

test('un único testimonio reciente se distingue de una confirmación independiente', () => {
  assert.equal(confidenceOf({ lastWaterStatus: 'flowing', lastUpdate: daysAgo(2), recentStatusReporters: 1 }, now), 'recent')
  assert.equal(confidenceOf({ lastWaterStatus: 'flowing', lastUpdate: daysAgo(2), latestConfirmations: 1 }, now), 'verified')
  assert.equal(confidenceOf({ lastWaterStatus: 'flowing', lastUpdate: daysAgo(2), recentStatusReporters: 2 }, now), 'verified')
})

test('la contradicción reciente manda aunque haya confirmaciones', () => {
  assert.equal(confidenceOf({ lastWaterStatus: 'flowing', lastUpdate: daysAgo(1), latestConfirmations: 3, recentStatusConflict: true }, now), 'disputed')
})

test('la evidencia caduca después de treinta días', () => {
  assert.equal(confidenceOf({ lastWaterStatus: 'flowing', lastUpdate: daysAgo(31), latestConfirmations: 2 }, now), 'stale')
})
