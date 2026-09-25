import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampPan, distance, midpoint, MAX_SCALE, NO_ZOOM, settle, toggleZoom, zoomAbout, type Zoom,
} from '../src/lib/pinchZoom.ts'

// A photo drawn at 300×400 inside a 375×700 viewer (a portrait photo on a phone).
const IMG_W = 300, IMG_H = 400, VP_W = 375, VP_H = 700

/** Where content point q is drawn for zoom z (coordinates relative to the centre). */
const drawn = (z: Zoom, q: { x: number; y: number }) => ({ x: z.x + z.s * q.x, y: z.y + z.s * q.y })

test('zooming about a point keeps that point under the fingers', () => {
  const at = { x: 60, y: -120 }
  const z = zoomAbout(NO_ZOOM, 3, at, at)
  // The content that was at `at` with no zoom is still drawn at `at`.
  const p = drawn(z, at)
  assert.ok(Math.abs(p.x - at.x) < 1e-9 && Math.abs(p.y - at.y) < 1e-9)
})

test('a pinch that moves pans with the fingers, from an already zoomed state', () => {
  const z0: Zoom = { s: 2, x: 40, y: -30 }
  const from = { x: 10, y: 10 }
  const to = { x: 70, y: 50 }
  const z1 = zoomAbout(z0, 3, from, to)
  const q = { x: (from.x - z0.x) / z0.s, y: (from.y - z0.y) / z0.s } // content under `from`
  const p = drawn(z1, q)
  assert.ok(Math.abs(p.x - to.x) < 1e-9 && Math.abs(p.y - to.y) < 1e-9)
})

test('without zoom the photo cannot be dragged at all', () => {
  assert.deepEqual(clampPan({ s: 1, x: 80, y: -50 }, IMG_W, IMG_H, VP_W, VP_H), { s: 1, x: 0, y: 0 })
})

test('zoomed, it pans only as far as it overflows the viewer, per axis', () => {
  // At 2×: 600×800. Overflows 225 px wide (±112.5) and 100 px tall (±50).
  const z = clampPan({ s: 2, x: 1000, y: -1000 }, IMG_W, IMG_H, VP_W, VP_H)
  assert.equal(z.x, 112.5)
  assert.equal(z.y, -50)
  // At 1.2×: 360 wide still fits in 375 → no horizontal pan; 480 tall still fits in 700.
  const small = clampPan({ s: 1.2, x: 30, y: 30 }, IMG_W, IMG_H, VP_W, VP_H)
  assert.equal(small.x, 0)
  assert.equal(small.y, 0)
})

test('lifting the fingers below 1× (or barely above) is exactly no zoom', () => {
  assert.deepEqual(settle({ s: 0.8, x: 20, y: 5 }, IMG_W, IMG_H, VP_W, VP_H), NO_ZOOM)
  // 1.01 would leave the photo "zoomed" and block the swipe to the next photo.
  assert.deepEqual(settle({ s: 1.01, x: 3, y: 3 }, IMG_W, IMG_H, VP_W, VP_H), NO_ZOOM)
})

test('overshooting the maximum snaps back to it and stays on screen', () => {
  const z = settle({ s: MAX_SCALE * 1.2, x: 5000, y: 0 }, IMG_W, IMG_H, VP_W, VP_H)
  assert.equal(z.s, MAX_SCALE)
  assert.ok(Math.abs(z.x) <= (IMG_W * MAX_SCALE - VP_W) / 2)
})

test('double tap zooms in on the tapped point and a second one zooms out', () => {
  const at = { x: 20, y: 40 }
  const zin = toggleZoom(NO_ZOOM, at, IMG_W, IMG_H, VP_W, VP_H)
  assert.ok(zin.s > 1)
  const p = drawn(zin, at)
  assert.ok(Math.abs(p.x - at.x) < 1e-9 && Math.abs(p.y - at.y) < 1e-9)
  assert.deepEqual(toggleZoom(zin, at, IMG_W, IMG_H, VP_W, VP_H), NO_ZOOM)
})

test('distance and midpoint of two fingers', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5)
  assert.deepEqual(midpoint({ x: 0, y: 10 }, { x: 20, y: 30 }), { x: 10, y: 20 })
})
