/** Tab-local, short-lived intent. The URL alone never authorizes a write. */
const KEY = 'favorite:pending'
const TTL = 10 * 60 * 1000
interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export function prepareFavorite(store: Store, fontID: string, token: string, now = Date.now()): string {
  store.setItem(KEY, JSON.stringify({ fontID, token, createdAt: now }))
  return `/fonts/${encodeURIComponent(fontID)}?favorite=${encodeURIComponent(token)}`
}
export function consumeFavorite(store: Store, fontID: string, token: string, now = Date.now()): boolean {
  const raw = store.getItem(KEY)
  if (!raw) return false
  // Remove even invalid/expired intents: never carry a stale action to another login.
  store.removeItem(KEY)
  try {
    const intent = JSON.parse(raw)
    return intent.fontID === fontID && intent.token === token &&
      typeof intent.createdAt === 'number' && now >= intent.createdAt && now - intent.createdAt < TTL
  } catch { return false }
}

export function clearFavoriteIntent(store: Store): void { store.removeItem(KEY) }
