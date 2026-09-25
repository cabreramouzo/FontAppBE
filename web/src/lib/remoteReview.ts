import { haversineKm } from './geo.ts'

/**
 * "Are you reviewing a fountain you are not at?"
 *
 * A review says how the water is **now**, and nothing stops anyone from saying it about a
 * fountain they have never seen. But reviewing from elsewhere is often honest: after a ride
 * ("Water on my route" asks for exactly that), from a queue that went out hours later, or
 * with a GPS that under trees claims to be hundreds of metres off. So this never blocks and
 * never accuses. When the position says the person is clearly far away, the app asks once —
 * "did you see it recently?" — and the review carries the approximate distance so the
 * moderation team can look at it. Nothing automatic hangs from it (same rule as
 * `queued_offline` and the photo EXIF): it orients a person, it never voids a review or its
 * drops by itself.
 *
 * The position is only used if location permission was ALREADY granted: asking for it here
 * would turn a review into a permission prompt, and a denial is forever. Without a position
 * nothing is asked and nothing is stored — which a determined liar can exploit by denying
 * permission, and that is accepted: the alternative punishes the honest majority.
 *
 * The distance is measured when the review is WRITTEN, not when it is sent, and travels
 * inside the review data — so an outbox item sent from home the next day is not flagged.
 */

/** Further than this (after subtracting the fix's accuracy) counts as "not there". */
export const REMOTE_M = 1000
/** A fix vaguer than this (Wi-Fi / cell location) cannot tell "here" from "far": ignore it. */
export const MAX_ACCURACY_M = 1000
/** How old a position may be and still describe where the person is writing from. */
export const FIX_MAX_AGE_MS = 3 * 60 * 1000

export type Fix = { lat: number; long: number; accuracy: number; t: number }

/**
 * Rounded distance in metres when the person is clearly far from the fountain, else null.
 *
 * `null` covers "near", "no position", "position too vague" and "position too old" alike —
 * all of them mean "do not ask and do not store anything". The benefit of the doubt is
 * built in: the fix's accuracy is subtracted before comparing, so a ±600 m fix 1.4 km away
 * is not remote.
 */
export function remoteDistanceM(fix: Fix | null, font: { latitude: number; longitude: number }, now = Date.now()): number | null {
  if (!fix) return null
  if (!Number.isFinite(fix.accuracy) || fix.accuracy > MAX_ACCURACY_M) return null
  if (now - fix.t > FIX_MAX_AGE_MS) return null
  const d = haversineKm(fix.lat, fix.long, font.latitude, font.longitude) * 1000
  if (!Number.isFinite(d) || d - Math.max(0, fix.accuracy) <= REMOTE_M) return null
  return roundDistance(d)
}

/**
 * Only an approximate distance is stored, never coordinates — the same choice as the EXIF
 * note ("12 m from the fountain"): enough to judge, without keeping where someone was.
 * 100 m steps under 10 km, whole kilometres above.
 */
export function roundDistance(m: number): number {
  return m < 10_000 ? Math.round(m / 100) * 100 : Math.round(m / 1000) * 1000
}

/** "1.4" / "12" / "230" — kilometres as shown in the question, in the reader's locale
 * ("1,4" in Catalan or Spanish). One decimal under 10 km, none above. */
export function kmLabel(m: number, locale = 'en'): string {
  const km = m / 1000
  return km.toLocaleString(locale, { maximumFractionDigits: km < 10 ? 1 : 0 })
}

// Fountains already confirmed in this tab: the question is asked once per fountain, not on
// every quick chip (after a photo, the app asks for the water status right away).
const confirmed = new Set<string>()
export const remoteAlreadyConfirmed = (fontID: string) => confirmed.has(fontID)
export const rememberRemoteConfirmed = (fontID: string) => { confirmed.add(fontID) }
