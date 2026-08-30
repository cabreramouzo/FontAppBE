import test from 'node:test'
import assert from 'node:assert/strict'
import { isRecentlyAvailable, isRecentlyUnavailable, matchesMunicipalFilter, needsReview, sortByMunicipalPriority } from '../src/lib/municipality.ts'
import type { MunicipalItem as Item } from '../src/lib/municipality.ts'
const item = (overrides: Partial<Item> = {}): Item => ({
  id: '1', name: null, latitude: 0, longitude: 0, source: null, drinkable: null,
  hasPhoto: true, reviews: 1, lastStatus: 'flowing', days: 10, openReports: 0,
  ...overrides,
})

test('un estado reciente distingue disponibilidad de inventario histórico', () => {
  assert.equal(isRecentlyAvailable(item()), true)
  assert.equal(isRecentlyAvailable(item({ days: 91 })), false)
  assert.equal(isRecentlyUnavailable(item({ lastStatus: 'dry' })), true)
})

test('revisión pendiente incluye nunca comprobadas y antiguas', () => {
  assert.equal(needsReview(item({ days: null })), true)
  assert.equal(needsReview(item({ days: 366 })), true)
  assert.equal(needsReview(item({ days: 365 })), false)
})

test('las incidencias abiertas encabezan las prioridades y los filtros son exactos', () => {
  const abierta = item({ id: 'open', openReports: 1 })
  const seca = item({ id: 'dry', lastStatus: 'dry' })
  assert.deepEqual(sortByMunicipalPriority([seca, abierta]).map((x) => x.id), ['open', 'dry'])
  assert.equal(matchesMunicipalFilter(abierta, 'open'), true)
  assert.equal(matchesMunicipalFilter(seca, 'available'), false)
})
