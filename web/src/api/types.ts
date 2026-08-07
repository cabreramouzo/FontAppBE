// Tipos del contrato de la API — ver ../../../docs/api.md.

export type WaterSource = 'tap' | 'spring' | 'well' | 'fountain' | 'other'
export type Drinkable = 'yes' | 'no' | 'conditional'

export interface Font {
  id: string
  name: string
  latitude: number
  longitude: number
  image: string | null
  description: string | null
  source: WaterSource | null
  drinkable: Drinkable | null
  creator?: { id: string | null }
  createdAt: string
}

export type UserRole = 'user' | 'moderator' | 'admin' | 'owner'

export interface UserResponse {
  id: string
  name: string
  username: string
  email?: string | null
  isAdmin?: boolean | null
  role?: UserRole | null
  emailPublic?: boolean | null
  namePublic?: boolean | null
  anonymized?: boolean
  createdAt?: string | null
}

/** Miembro del equipo (rol > user) para la gestión de roles del owner. */
export interface StaffMember {
  id: string
  username: string
  role: UserRole
}

/** Fila del listado completo de usuarios (solo owner). Sin hash de contraseña. */
export interface AdminUser {
  id: string
  username: string
  name: string
  email: string | null
  role: UserRole
  signupCountry: string | null
  signupRegion: string | null
  signupCity: string | null
  anonymized: boolean
  createdAt: string | null
}

export interface Flag {
  id: string
  flaggerName: string | null
  targetType: 'comment' | 'font'
  targetID: string
  fontID: string | null
  reason: string | null
  createdAt: string
  targetText: string | null
  targetImage: string | null
}

export interface FontInfoSnapshot {
  name: string
  description: string | null
  source: WaterSource | null
  drinkable: Drinkable | null
}

export interface FontEdit {
  id: string
  fontID: string
  fontName: string | null
  editorID: string | null
  editorName: string | null
  before: FontInfoSnapshot
  after: FontInfoSnapshot
  createdAt: string
}

export interface RegionStat {
  country: string | null
  region: string | null
  count: number
}

export interface LoginResponse {
  token: string
  expiresAt: string | null
  user: UserResponse
}

export interface ReportResponse {
  id: string
  fontID: string
  userID: string | null
  username: string | null
  message: string
  createdAt: string
}

export interface CommentResponse {
  id: string
  fontID: string
  userID: string | null
  username: string | null
  body: string
  rating: number | null
  waterStatus: string | null
  image: string | null
  createdAt: string
  confirmations: number
  confirmedByMe: boolean
  lastConfirmedAt: string | null
}

/** Reseña propia con el nombre de la fuente (pantalla de perfil). */
export interface MyComment {
  id: string
  fontID: string
  fontName: string | null
  body: string
  rating: number | null
  waterStatus: string | null
  createdAt: string
}

export interface Page<T> {
  items: T[]
  metadata: { total: number; per: number; page: number }
}

/** Fuente + último estado del agua reportado (listado del mapa). */
export interface FontSummary extends Font {
  lastWaterStatus: string | null
  lastUpdate: string | null
}

/** Estado de favoritos de una fuente (guardada por el usuario + recuento total). */
export interface FavoriteStatus {
  favorited: boolean
  count: number
}

export type AppPlatform = 'ios' | 'android' | 'other'

/** Un votante identificado del interés por app móvil (vista admin). */
export interface InterestVoter {
  username: string
  wants: boolean
  platform: AppPlatform | null
  at: string | null
}

/** Recuento de interés por app móvil (vista admin). */
export interface InterestStats {
  yes: number
  no: number
  total: number
  voters: InterestVoter[]
}

/** Sugerencia / feedback de un usuario (vista admin). */
export interface Feedback {
  id: string
  username: string | null
  message: string
  country: string | null
  email: string | null
  createdAt: string | null
}
