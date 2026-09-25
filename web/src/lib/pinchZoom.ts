/**
 * Geometry for zooming a photo in the fullscreen viewer (`ZoomableImage`'s lightbox).
 *
 * The viewer sets `touch-action: none` so it can own the swipe-to-change and
 * drag-to-dismiss gestures, and that also switches off the browser's own pinch zoom — so
 * zooming is done by hand, with a CSS `translate(x, y) scale(s)` on the photo.
 *
 * All coordinates are relative to the CENTRE of the photo's untransformed box (which is
 * also the centre of the viewer, since the photo is centred in it). A point `q` of the
 * photo content is drawn on screen at `T + s * q`.
 *
 * Pure and without DOM access so it can be tested in Node: every case here fails silently
 * in the browser (the photo drifts away from under the fingers, or can be dragged off
 * screen) and nothing throws.
 */

export type Zoom = { s: number; x: number; y: number }
export type Point = { x: number; y: number }

export const MIN_SCALE = 1
export const MAX_SCALE = 4
/** Scale a double tap zooms into. */
export const DOUBLE_TAP_SCALE = 2.5
export const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * New zoom at scale `s` such that the content point that was under `from` (at zoom `z`)
 * ends up under `to`. With `from === to` this is "zoom around this point" (wheel, double
 * tap); with a moving `to` it is a pinch that also pans with the fingers.
 */
export function zoomAbout(z: Zoom, s: number, from: Point, to: Point): Zoom {
  const qx = (from.x - z.x) / z.s
  const qy = (from.y - z.y) / z.s
  return { s, x: to.x - s * qx, y: to.y - s * qy }
}

/**
 * Keeps the photo covering the viewer instead of being dragged off into black: it can
 * move only as far as its enlarged size overflows the viewer, and not at all along an
 * axis where it still fits.
 */
export function clampPan(z: Zoom, imgW: number, imgH: number, vpW: number, vpH: number): Zoom {
  const maxX = Math.max(0, (imgW * z.s - vpW) / 2)
  const maxY = Math.max(0, (imgH * z.s - vpH) / 2)
  // An axis with no room is exactly 0 (clamping into ±0 can give -0).
  return {
    s: z.s,
    x: maxX === 0 ? 0 : clamp(z.x, -maxX, maxX),
    y: maxY === 0 ? 0 : clamp(z.y, -maxY, maxY),
  }
}

/**
 * Where the photo rests when the fingers lift. During the gesture the scale may overshoot
 * a little (it feels elastic instead of hitting a wall); here it snaps back into range,
 * rescaling about the centre, and the pan is clamped. Anything close to 1 is exactly no
 * zoom, so a pinch that ends at 1.004 does not leave the photo "zoomed" and blocking the
 * swipe to the next one.
 */
export function settle(z: Zoom, imgW: number, imgH: number, vpW: number, vpH: number): Zoom {
  const s = clamp(z.s, MIN_SCALE, MAX_SCALE)
  if (s <= MIN_SCALE + 0.02) return NO_ZOOM
  const k = s / z.s
  return clampPan({ s, x: z.x * k, y: z.y * k }, imgW, imgH, vpW, vpH)
}

/** Double tap / double click: zoom in on the tapped point, or back out if zoomed. */
export function toggleZoom(z: Zoom, at: Point, imgW: number, imgH: number, vpW: number, vpH: number): Zoom {
  if (z.s > MIN_SCALE) return NO_ZOOM
  return clampPan(zoomAbout(NO_ZOOM, DOUBLE_TAP_SCALE, at, at), imgW, imgH, vpW, vpH)
}

export const isZoomed = (z: Zoom) => z.s > MIN_SCALE
