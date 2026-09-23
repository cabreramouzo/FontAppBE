import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareFavorite, consumeFavorite, clearFavoriteIntent } from '../src/lib/favoriteIntent.ts'
function store() {
  const values = new Map<string, string>()
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) } }
}
test('login return preserves the exact fountain and consumes the save once', () => {
  const s = store()
  assert.equal(prepareFavorite(s, 'source-1', 'nonce', 100), '/fonts/source-1?favorite=nonce')
  assert.equal(consumeFavorite(s, 'source-1', 'nonce', 101), true)
  assert.equal(consumeFavorite(s, 'source-1', 'nonce', 102), false)
})
test('shared URLs, wrong fountains, stale and replaced login attempts cannot save', () => {
  assert.equal(consumeFavorite(store(), 'source-1', 'nonce', 101), false)
  for (const [id, token, now] of [['other', 'nonce', 101], ['source-1', 'other', 101], ['source-1', 'nonce', 600100], ['source-1', 'nonce', 99]] as const) {
    const s = store()
    prepareFavorite(s, 'source-1', 'nonce', 100)
    assert.equal(consumeFavorite(s, id, token, now), false)
    assert.equal(consumeFavorite(s, 'source-1', 'nonce', 101), false)
  }
})

test('logout clears the intent before another account can resume it', () => {
  const s = store()
  prepareFavorite(s, 'source-1', 'nonce', 100)
  clearFavoriteIntent(s)
  assert.equal(consumeFavorite(s, 'source-1', 'nonce', 101), false)
})
