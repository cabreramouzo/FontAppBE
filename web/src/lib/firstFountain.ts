/**
 * The welcome nudge shown once to a brand-new visitor, right after they grant location.
 *
 * The idea: turn the abstract map of blue dots into a concrete answer to "where do I
 * drink?". A fixed "your nearest fountain is X km away, go check it!" fails two real,
 * measured cases — a fountain already confirmed with water needs no report, and in a
 * data-poor area the nearest one can be 44 km away, where "go for a walk" is absurd.
 *
 * So the message adapts to what is actually nearby, and this pure function picks which of
 * the three it is, off the **nearest** fountain (what the user expects: "your closest
 * one") and its state:
 *
 * - `gift`    — the nearest is confirmed flowing/recent: pure value, ask for nothing.
 * - `mission` — a fountain within reach whose state is unknown or stale: a small, honest
 *               quest ("nobody has checked it — if you pass by, tell us").
 * - `explore` — nothing useful nearby: don't invite a walk, invite starting the local map.
 *
 * It takes primitives, not a `ConfidenceEvidence`, on purpose: this module is pure and
 * loaded by the Node tests, which resolve with nodenext and can't import other src modules
 * without an extension. The caller already has `confidence` and computes `hasWaterNow`
 * (via `constaAgua`) and `neverChecked` (a missing `lastUpdate`) before calling in.
 */
export type FirstFountainKind = 'gift' | 'mission' | 'explore'

/** Beyond this, "nearby" stops being true and we switch to `explore`. */
export const NEARBY_KM = 5

export interface Nearest {
  distanceKm: number
  /** `constaAgua`: flowing/trickle AND recent enough to trust. Computed by the caller. */
  hasWaterNow: boolean
}

export function firstFountainKind(nearest: Nearest | null): FirstFountainKind {
  if (!nearest || nearest.distanceKm > NEARBY_KM) return 'explore'
  if (nearest.hasWaterNow) return 'gift'
  return 'mission'
}
