import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSavedMapView } from '../src/lib/mapView.ts'

test('accepts a valid saved map view', () => {
  assert.deepEqual(parseSavedMapView('{"lat":40.4,"lng":-3.7,"zoom":7}'), {
    lat: 40.4, lng: -3.7, zoom: 7,
  })
})

test('rejects malformed and out-of-range map views', () => {
  for (const raw of [null, '', '{', '{}', '{"lat":null,"lng":2,"zoom":5}',
    '{"lat":91,"lng":2,"zoom":5}', '{"lat":40,"lng":181,"zoom":5}',
    '{"lat":40,"lng":2,"zoom":99}']) {
    assert.equal(parseSavedMapView(raw), null)
  }
})
