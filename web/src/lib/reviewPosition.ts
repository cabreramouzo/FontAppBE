import { FIX_MAX_AGE_MS, type Fix } from './remoteReview'

/**
 * The browser half of `remoteReview.ts`: getting a position to judge a review by.
 *
 * Split out because it touches `navigator` and `window`, and `remoteReview.ts` is imported
 * by a Node test — the same reason `lib/apiError.ts` lives apart from `api/client.ts`.
 */

let lastFix: Fix | null = null
let inFlight: Promise<Fix | null> | null = null

/**
 * Starts getting a position in the background, only if permission is already granted.
 * Called when a fountain's detail or popup opens, so that by the time the person taps
 * "publish" there is a fix and publishing does not wait on the GPS.
 */
export function warmReviewPosition(): Promise<Fix | null> {
  if (lastFix && Date.now() - lastFix.t < FIX_MAX_AGE_MS) return Promise.resolve(lastFix)
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) return null
      const state = await navigator.permissions?.query({ name: 'geolocation' })
      if (state?.state !== 'granted') return null
      return await new Promise<Fix | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => { lastFix = { lat: p.coords.latitude, long: p.coords.longitude, accuracy: p.coords.accuracy, t: Date.now() }; resolve(lastFix) },
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
        )
      })
    } catch {
      return null
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * The fix to judge a review by, waiting at most `waitMs` for one that is on its way.
 * Publishing must never hang on the GPS: without a fix in time, nothing is asked.
 */
export async function reviewFix(waitMs = 1200): Promise<Fix | null> {
  if (lastFix && Date.now() - lastFix.t < FIX_MAX_AGE_MS) return lastFix
  const pending = warmReviewPosition()
  return Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), waitMs))])
}
