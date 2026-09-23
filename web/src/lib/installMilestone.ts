/** Offer installation after a successful save, never merely for opening tabs. */
export const INSTALL_MILESTONE_EVENT = 'fontapp:useful-action'
const KEY = 'install:useful-action'
export function hasInstallMilestone(): boolean {
  try { return localStorage.getItem(KEY) === 'favorite' } catch { return false }
}
export function markInstallMilestone(): void {
  try { localStorage.setItem(KEY, 'favorite') } catch { /* optional hint */ }
  const browser = globalThis as typeof globalThis & { window?: { dispatchEvent(event: Event): boolean } }
  browser.window?.dispatchEvent(new Event(INSTALL_MILESTONE_EVENT))
}
