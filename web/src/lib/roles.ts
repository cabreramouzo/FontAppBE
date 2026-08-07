import type { UserResponse, UserRole } from '../api/types'

// Rango jerárquico de cada rol (mayor = más permisos). Debe coincidir con `UserRole` del backend.
const RANK: Record<UserRole, number> = { user: 0, moderator: 1, admin: 2, owner: 3 }

type MaybeUser = Pick<UserResponse, 'role' | 'isAdmin'> | null | undefined

/** Rango del usuario; si el backend no manda `role` (compat), deduce de `isAdmin`. */
export function roleRank(u: MaybeUser): number {
  if (!u) return 0
  if (u.role && u.role in RANK) return RANK[u.role]
  return u.isAdmin ? RANK.admin : RANK.user
}

export const canModerate = (u: MaybeUser): boolean => roleRank(u) >= RANK.moderator
export const isAdminRole = (u: MaybeUser): boolean => roleRank(u) >= RANK.admin
export const isOwner = (u: MaybeUser): boolean => roleRank(u) >= RANK.owner
