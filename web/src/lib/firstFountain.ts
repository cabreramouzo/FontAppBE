/**
 * The welcome nudge shown once to a brand-new visitor, right after they grant location.
 *
 * The idea: turn the abstract map of blue dots into a concrete answer to "where do I
 * drink?". It gives the **best** answer, not merely the closest fountain — and that
 * distinction is the fix for a real bug: deciding off the single nearest one meant a
 * fountain reported *dry* three days ago fell into "mission" under the wording "nobody has
 * checked it", which was both false and contradicted its own page.
 *
 * So the caller looks across the nearby fountains and hands in two distances:
 *
 * - `gift`    — there's confirmed water within reach: point them to it, ask nothing.
 * - `mission` — no water nearby, but a fountain nobody has *ever* checked is within reach:
 *               an honest quest ("nobody has checked it — if you pass by, tell us").
 * - `dry`     — there are fountains nearby but they're all checked and without water: say
 *               so plainly, and invite a re-check in case the water is back.
 * - `explore` — no fountains nearby at all: invite starting the local map.
 *
 * A dry-and-recently-confirmed fountain is neither water (gift) nor unchecked (mission);
 * it lands in `dry`, which is what surfaced the whole rework.
 *
 * Primitives, not a `ConfidenceEvidence`, on purpose: this module is pure and loaded by
 * the Node tests, which resolve with nodenext and can't import other src modules without
 * an extension. The caller has `confidence` and computes both distances before calling in.
 */
export type FirstFountainKind = 'gift' | 'mission' | 'dry' | 'explore'

/** Beyond this, "nearby" stops being true and we switch to `explore`. */
export const NEARBY_KM = 5

export interface NearbyWater {
  /** Distance to the nearest fountain with confirmed water now (`constaAgua`), or null. */
  waterKm: number | null
  /** Distance to the nearest fountain nobody has ever checked (`!lastUpdate`), or null. */
  unknownKm: number | null
  /** Distance to the nearest fountain of any state at all, or null if there are none. */
  anyKm: number | null
}

export function firstFountainKind({ waterKm, unknownKm, anyKm }: NearbyWater): FirstFountainKind {
  if (waterKm !== null && waterKm <= NEARBY_KM) return 'gift'
  if (unknownKm !== null && unknownKm <= NEARBY_KM) return 'mission'
  // There are fountains nearby, just none with water and none unchecked → all dry/broken.
  if (anyKm !== null && anyKm <= NEARBY_KM) return 'dry'
  return 'explore'
}
