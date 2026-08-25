import type { Font, WaterSource } from '../api/types.ts'

const key = (kind: 'searches' | 'fountains', scope: string) => `history:${kind}:v1:${scope}`
const MAX_SEARCHES = 6
const MAX_FOUNTAINS = 8

export type RecentFountain = Pick<Font, 'id' | 'name' | 'latitude' | 'longitude'> & {
  region?: string | null
  source?: WaterSource | null
}

export function addRecentSearch(items: string[], raw: string): string[] {
  const term = raw.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (term.length < 2) return items
  return [term, ...items.filter((item) => item.localeCompare(term, undefined, { sensitivity: 'accent' }) !== 0)].slice(0, MAX_SEARCHES)
}

export function addRecentFountain(items: RecentFountain[], font: RecentFountain): RecentFountain[] {
  return [font, ...items.filter((item) => item.id !== font.id)].slice(0, MAX_FOUNTAINS)
}

function read<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function write<T>(key: string, value: T[]) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* almacenamiento privado/bloqueado */ }
}

export function recentSearches(scope: string): string[] { return read<string>(key('searches', scope)) }
export function recentFountains(scope: string): RecentFountain[] { return read<RecentFountain>(key('fountains', scope)) }
export function rememberSearch(term: string, scope: string) { write(key('searches', scope), addRecentSearch(recentSearches(scope), term)) }
export function rememberFountain(font: RecentFountain, scope: string) { write(key('fountains', scope), addRecentFountain(recentFountains(scope), font)) }
export function clearRecentHistory(scope: string) {
  try { localStorage.removeItem(key('searches', scope)); localStorage.removeItem(key('fountains', scope)) } catch { /* almacenamiento privado/bloqueado */ }
}
