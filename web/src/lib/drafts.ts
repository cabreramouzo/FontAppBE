/**
 * Drafts of forms the user has started and not sent.
 *
 * Reported: someone filled in a new fountain, forgot to press "create", locked the phone
 * and ten minutes later the form was gone. On a phone that is the normal case, not an
 * edge one — iOS kills a backgrounded PWA whenever it likes, and with it every `useState`.
 * So what someone has typed is written to `localStorage` as they type, and handed back
 * the next time that form opens.
 *
 * - **Per account.** The key carries the user id (or `anonymous`), same rule as the
 *   outbox and the remembered route: on a shared phone the next person must not find
 *   someone else's half-written review, nor publish it under their own name.
 * - **Text and choices only, never the photo.** A `File` does not survive
 *   `localStorage`, and a Blob in IndexedDB dies on iOS (see the field bugs of
 *   September 2026). The draft says whether there was one, so the form can ask for it
 *   again instead of silently dropping it.
 * - **Seven days.** After that a draft is more likely to confuse than to help — a review
 *   of how a fountain flowed last month is not what someone means to publish today.
 * - **Cleared on send and on an explicit discard**, never on unmount: unmounting is
 *   exactly what happens when the phone kills the app.
 */

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface Stored<T> { savedAt: number; value: T }

/** The storage the drafts use. A parameter so tests can pass a fake one. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): DraftStorage | null {
  try { return window.localStorage } catch { return null }
}

export function draftKey(user: string | null | undefined, form: string): string {
  return `draft:${user ?? 'anonymous'}:${form}`
}

export function loadDraft<T>(key: string, now = Date.now(), storage = defaultStorage()): T | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored<T>
    if (typeof stored?.savedAt !== 'number' || now - stored.savedAt > DRAFT_TTL_MS) {
      storage.removeItem(key)
      return null
    }
    return stored.value ?? null
  } catch {
    return null
  }
}

export function saveDraft<T>(key: string, value: T, now = Date.now(), storage = defaultStorage()): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, value } satisfies Stored<T>))
  } catch {
    /* storage full or blocked: the form still works, it just will not be remembered */
  }
}

export function clearDraft(key: string, storage = defaultStorage()): void {
  if (!storage) return
  try { storage.removeItem(key) } catch { /* nothing to do */ }
}

/**
 * What a form does on every change: remember it, or forget it once there is nothing
 * left worth keeping (the user emptied every field by hand).
 */
export function syncDraft<T>(key: string, value: T, empty: boolean, now = Date.now(), storage = defaultStorage()): void {
  if (empty) clearDraft(key, storage)
  else saveDraft(key, value, now, storage)
}
