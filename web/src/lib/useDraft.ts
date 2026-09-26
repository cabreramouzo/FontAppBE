import { useEffect, useRef, useState } from 'react'
import { syncDraft, loadDraft } from './drafts'

/**
 * A form's draft, React side (rules in lib/drafts). Two halves because the saved value
 * has to seed the fields' `useState` before the fields exist:
 *
 *     const saved = useRestoredDraft<Review>(key)
 *     const [body, setBody] = useState(saved?.body ?? '')
 *     useSaveDraft(key, { body }, !body.trim(), !!saved)
 */

/** The draft saved for this form, read once when it mounts. */
export function useRestoredDraft<T>(key: string | null): T | null {
  const [restored] = useState(() => (key ? loadDraft<T>(key) : null))
  return restored
}

/**
 * Keeps the draft written as the fields change, and removes it once they are empty again
 * (which is also what a successful send does, since it resets the fields).
 *
 * Nothing is written until the form has held something: a form that opens empty must not
 * delete a draft left by an earlier one. `restored` says it already held something.
 */
export function useSaveDraft<T>(key: string | null, value: T, empty: boolean, restored: boolean): void {
  const touched = useRef(restored)
  const json = JSON.stringify(value)
  useEffect(() => {
    if (!key) return
    if (!empty) touched.current = true
    if (!touched.current) return
    syncDraft(key, JSON.parse(json) as T, empty)
  }, [key, json, empty])
}
