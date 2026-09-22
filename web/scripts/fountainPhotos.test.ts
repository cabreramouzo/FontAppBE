import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CommentResponse } from '../src/api/types.ts'
import { fountainPhotos, latestReviewPhoto } from '../src/lib/fountainPhotos.ts'

const now = Date.parse('2026-09-22T12:00:00Z')
const review = (id: string, days: number, image: string | null): CommentResponse => ({
  id, fontID: 'fountain', userID: null, username: null, body: '', rating: null,
  waterStatus: 'dry', image, createdAt: new Date(now - days * 86_400_000).toISOString(),
  confirmations: 0, confirmedByMe: false, lastConfirmedAt: null, coverAdopted: false,
})

test('cover stays first while review photos use date order without mutating reviews', () => {
  const reviews = [review('old', 20, 'old.jpg'), review('text', 1, null), review('new', 2, 'new.jpg')]
  assert.deepEqual(fountainPhotos('cover.jpg', reviews).map(photo => photo.key), ['cover', 'new', 'old'])
  assert.deepEqual(reviews.map(item => item.id), ['old', 'text', 'new'])
})

test('review photos remain accessible without a cover and an empty gallery stays empty', () => {
  assert.deepEqual(fountainPhotos(null, [review('new', 2, 'new.jpg')]).map(photo => photo.key), ['new'])
  assert.deepEqual(fountainPhotos(null, [review('text', 1, null)]), [])
})

test('latest photo shortcut does not substitute an older review when the newest has no photo', () => {
  assert.equal(latestReviewPhoto([review('old', 2, 'old.jpg'), review('text', 1, null)], now), null)
  assert.equal(latestReviewPhoto([review('old', 2, 'old.jpg'), review('new', 1, 'new.jpg')], now), 'new')
})

test('confirming an old review cannot make its photo recent', () => {
  const old = { ...review('old', 31, 'old.jpg'), lastConfirmedAt: new Date(now).toISOString() }
  assert.equal(latestReviewPhoto([old], now), null)
  assert.equal(latestReviewPhoto([review('boundary', 30, 'photo.jpg')], now), 'boundary')
  assert.equal(latestReviewPhoto([review('future', -1, 'photo.jpg')], now), null)
})
