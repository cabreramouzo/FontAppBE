export interface MunicipalItem {
  id: string
  name: string | null
  latitude: number
  longitude: number
  source: string | null
  drinkable: string | null
  hasPhoto: boolean
  reviews: number
  lastStatus: string | null
  days: number | null
  openReports: number
}
export type MunicipalFilter = 'all' | 'open' | 'unavailable' | 'review' | 'never' | 'stale' | 'noPhoto' | 'available'

const AVAILABLE = new Set(['flowing', 'trickle'])
const UNAVAILABLE = new Set(['dry', 'broken', 'gone'])

export function isRecentlyAvailable(item: MunicipalItem): boolean {
  return item.days != null && item.days <= 90 && AVAILABLE.has(item.lastStatus ?? '')
}

export function isRecentlyUnavailable(item: MunicipalItem): boolean {
  return item.days != null && item.days <= 90 && UNAVAILABLE.has(item.lastStatus ?? '')
}

export function needsReview(item: MunicipalItem): boolean {
  return item.days == null || item.days > 365
}

export function matchesMunicipalFilter(item: MunicipalItem, filter: MunicipalFilter): boolean {
  switch (filter) {
    case 'open': return item.openReports > 0
    case 'unavailable': return isRecentlyUnavailable(item)
    case 'review': return needsReview(item)
    case 'never': return item.days == null
    case 'stale': return item.days != null && item.days > 365
    case 'noPhoto': return !item.hasPhoto
    case 'available': return isRecentlyAvailable(item)
    default: return true
  }
}

/** Mayor puntuación = actuación más urgente; el orden es estable por antigüedad. */
export function municipalPriority(item: MunicipalItem): number {
  return (item.openReports > 0 ? 10_000 + item.openReports * 100 : 0)
    + (isRecentlyUnavailable(item) ? 5_000 : 0)
    + (item.days == null ? 2_000 : Math.min(item.days, 1_500))
    + (!item.hasPhoto ? 100 : 0)
}

export function sortByMunicipalPriority(items: MunicipalItem[]): MunicipalItem[] {
  return [...items].sort((a, b) => municipalPriority(b) - municipalPriority(a))
}
