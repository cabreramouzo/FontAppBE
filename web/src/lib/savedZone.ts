/** One explicit area per account on this device; never derived from GPS. */
export type SavedZone = { kind: 'place'; name: string; slug: string } | { kind: 'region'; name: string; country: string | null }
const key = (scope: string) => `zone:saved:v1:${scope}`
export const SAVED_ZONE_EVENT = 'fontapp:saved-zone'
export function readSavedZone(scope: string): SavedZone | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(scope)) ?? 'null')
    if (!value || typeof value.name !== 'string' || !value.name.trim()) return null
    if (value.kind === 'place' && typeof value.slug === 'string' && /^[\w-]+$/.test(value.slug)) return value
    if (value.kind === 'region' && (value.country === null || typeof value.country === 'string')) return value
  } catch { /* missing or unavailable storage */ }
  return null
}
export function saveZone(scope: string, zone: SavedZone | null): boolean {
  try {
    if (zone) localStorage.setItem(key(scope), JSON.stringify(zone))
    else localStorage.removeItem(key(scope))
    return true
  } catch { return false }
}
export function savedZoneHref(zone: SavedZone): string {
  if (zone.kind === 'place') return `/places/${encodeURIComponent(zone.slug)}`
  return `/zones?${new URLSearchParams({ region: zone.name, country: zone.country ?? '*' })}`
}
