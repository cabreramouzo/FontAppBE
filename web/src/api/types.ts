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

export interface UserResponse {
  id: string
  name: string
  username: string
  email?: string | null
  isAdmin?: boolean | null
}

export interface Flag {
  id: string
  flaggerName: string | null
  targetType: 'comment' | 'font'
  targetID: string
  reason: string | null
  createdAt: string
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
