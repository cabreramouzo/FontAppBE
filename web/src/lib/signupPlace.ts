import { apiFetch } from '../api/client'

// Where a new account signed up, as a municipality, to tell which posters work in which
// towns (the signup IP is useless: VPNs and carriers resolve to Madrid or Turkey).
// It rides on a position the map already obtained with a permission the person granted
// — typically during the welcome tutorial — and never asks for one. The server keeps
// only the municipality and throws the coordinates away; see `SignupPlace.swift`.

const WINDOW_MS = 14 * 86_400_000
const key = (userID: string) => `signupPlace:sent:${userID}`

/** True when this account is new enough and has not sent its place from this device. */
export function shouldSendSignupPlace(user: { id: string; createdAt?: string | null } | null, now = Date.now()): boolean {
  if (!user?.createdAt) return false
  const joined = Date.parse(user.createdAt)
  if (!Number.isFinite(joined) || now - joined > WINDOW_MS) return false
  try { return localStorage.getItem(key(user.id)) == null } catch { return false }
}

/** Best-effort and once: a failure is simply not retried, it is a statistic. */
export function sendSignupPlace(userID: string, latitude: number, longitude: number): void {
  try { localStorage.setItem(key(userID), '1') } catch { return }
  apiFetch('/users/me/signup-place', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude }),
  }).catch(() => {})
}
