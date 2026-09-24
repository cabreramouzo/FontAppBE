import assert from 'node:assert/strict'
import test from 'node:test'
import { readSavedZone, saveZone, savedZoneHref } from '../src/lib/savedZone.ts'

test('saved areas are explicit, account-scoped, replaceable and removable', () => {
  const values = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  }
  const region = { kind: 'region' as const, name: 'A & B', country: 'Spain' }
  assert.equal(saveZone('a', region), true)
  assert.deepEqual(readSavedZone('a'), region)
  assert.equal(readSavedZone('b'), null)
  assert.equal(readSavedZone('anonymous'), null)
  assert.equal(savedZoneHref(region), '/zones?region=A+%26+B&country=Spain')
  saveZone('a', { kind: 'place', name: 'Moià', slug: 'moia' })
  assert.equal(savedZoneHref(readSavedZone('a')!), '/places/moia')
  saveZone('a', null)
  assert.equal(readSavedZone('a'), null)
  values.set('zone:saved:v1:a', JSON.stringify({ kind: 'place', name: 'Bad', slug: '//evil.test' }))
  assert.equal(readSavedZone('a'), null)
  values.set('zone:saved:v1:a', '{')
  assert.equal(readSavedZone('a'), null)
})
