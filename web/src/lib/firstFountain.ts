/** Classify proximity without inferring a water state from missing evidence.
 * `check` includes old, conflicting, dry and broken reports; the UI shows the
 * selected fountain's actual last report instead of generalising to the area.
 */
export type FirstFountainKind = 'gift' | 'mission' | 'check' | 'explore'

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
  // Proximity alone says nothing about why no reliable water report was found.
  if (anyKm !== null && anyKm <= NEARBY_KM) return 'check'
  return 'explore'
}
