import assert from 'node:assert/strict'
import test from 'node:test'
import { HEATMAP_MAX_ZOOM, showsDensity, showsHeatmap } from '../src/lib/mapDensity.ts'

test('density legend follows the heatmap visibility boundary', () => {
  assert.equal(showsHeatmap(3, HEATMAP_MAX_ZOOM), true)
  assert.equal(showsHeatmap(3, HEATMAP_MAX_ZOOM + 1), false)
})

test('density legend covers both heatmaps and numbered aggregates', () => {
  assert.equal(showsDensity(3), true)
  assert.equal(showsDensity(0, true), true)
  assert.equal(showsDensity(0), false)
})
