// Tipos del contrato de la API — ver ../../../docs/api.md.

export type WaterSource = 'tap' | 'mountain' | 'spring' | 'well' | 'fountain' | 'other'
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
  /** Resumen semanal por correo (solo en respuestas propias). */
  weeklyDigest?: boolean | null
  /** Si ha apagado la gamificación (solo en respuestas propias). */
  gamificationOptOut?: boolean | null
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
  reviewedAt: string | null
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

/** Marcador de gamificación del usuario autenticado (`GET /gamification/me`). */
export interface GamificationProfile {
  gotes: number
  /** Gotas en camino: aportadas pero aún dentro de la ventana de 72 h. */
  pending: number
  level: string
  nextLevel?: string | null
  gotesToNextLevel?: number | null
  badges: { family: string; tier: string; progress: number; threshold: number }[]
  byKind: { kind: string; label: string; count: number; gotes: number }[]
  impact: {
    fontsWithPhotoThanksToYou: number
    fontsYouKeepFresh: number
    fontsYouPutOnTheMap: number
  }
  /** Los puntos todavía se pueden recalcular; se avisa en la interfaz. */
  provisional: boolean
  /** Fase 6: qué abre tu nivel y, si no abre nada, por qué. */
  grant?: {
    capabilities: string[]
    /** `disabled` · `provisional` · `optedOut` · `activeDays` · `recentlyVoided` · `gotes` */
    blockedBy: string[]
    /** Lo que aún no tienes, con el nivel que lo abre. */
    upcoming?: { key: string; level: string; gotes: number }[]
  } | null
  /** La vitrina: los diez peldaños de abajo arriba. */
  levels: LevelStanding[]
  /** Todas las familias de insignias, conseguidas o no. */
  collection: BadgeSlot[]
}

export interface LevelStanding {
  key: string
  from: number
  reached: boolean
  current: boolean
}

export interface BadgeSlot {
  family: string
  /** `bronze` · `silver` · `gold` · `unique`, o null si aún no la tienes. */
  tier: string | null
  progress: number
  threshold: number
  thresholds: number[]
}

/** Una parada de una ruta propuesta (`GET /missions`). */
export interface MissionTarget {
  id: string
  name: string
  latitude: number
  longitude: number
  distanceKm: number
  /** Última comprobación, o null si no ha pasado nadie nunca. */
  lastCheck?: string | null
}

/** Rutas propuestas alrededor de un punto. Fase 4 de la gamificación. */
export interface Missions {
  km: number
  /** Ruta ciega: fuentes sin ninguna foto. */
  photoless: MissionTarget[]
  /** Ronda: sin comprobar desde hace más de medio año. */
  stale: MissionTarget[]
}

/** Cobertura colectiva de una zona. Fase 5 de la gamificación. */
export interface ZoneCoverage {
  country: string | null
  region: string
  fonts: number
  withPhoto: number
  checkedRecently: number
  photoPct: number
  freshPct: number
}

export interface ZoneCoverageResponse {
  zones: ZoneCoverage[]
  /** Corte de «comprobada hace poco», en días. */
  freshDays: number
}

export interface ZoneRankingRow {
  rank: number
  username: string
  gotes: number
}

export interface ZoneRanking {
  region: string
  /** AAAA-MM */
  month: string
  rows: ZoneRankingRow[]
}
