import assert from 'node:assert/strict'
import test from 'node:test'
import { freshnessColor } from '../src/lib/freshness.ts'

test('recent evidence is neutral rather than a positive water signal', () => {
  assert.equal(freshnessColor('week'), 'default')
  assert.equal(freshnessColor('month'), 'default')
})

test('old evidence remains a warning', () => {
  assert.equal(freshnessColor('old'), 'warning')
})
