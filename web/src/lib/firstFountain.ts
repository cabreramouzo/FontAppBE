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
 * - `explore` — neither: don't invite a walk, invite starting the local map.
 *
 * A dry-and-recently-confirmed fountain is deliberately neither: not water (gift), and not
 * unchecked (mission). It falls through to whatever else is nearby, or to explore.
 *
 * Primitives, not a `ConfidenceEvidence`, on purpose: this module is pure and loaded by
 * the Node tests, which resolve with nodenext and can't import other src modules without
 * an extension. The caller has `confidence` and computes both distances before calling in.
 */
export type FirstFountainKind = 'gift' | 'mission' | 'explore'

/** Beyond this, "nearby" stops being true and we switch to `explore`. */
export const NEARBY_KM = 5

export interface NearbyWater {
  /** Distance to the nearest fountain with confirmed water now (`constaAgua`), or null. */
  waterKm: number | null
  /** Distance to the nearest fountain nobody has ever checked (`!lastUpdate`), or null. */
  unknownKm: number | null
}

export function firstFountainKind({ waterKm, unknownKm }: NearbyWater): FirstFountainKind {
  if (waterKm !== null && waterKm <= NEARBY_KM) return 'gift'
  if (unknownKm !== null && unknownKm <= NEARBY_KM) return 'mission'
  return 'explore'
}
