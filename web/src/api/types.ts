// Tipos del contrato de la API — ver ../../../docs/api.md.

export type WaterSource = 'tap' | 'mountain' | 'spring' | 'well' | 'fountain' | 'other'
export type Drinkable = 'yes' | 'no' | 'conditional' | 'untreated'

export interface Font {
  id: string
  /** `null` si no tiene nombre propio. El rótulo lo compone `nombreFuente`. */
  name: string | null
  latitude: number
  longitude: number
  image: string | null
  description: string | null
  source: WaterSource | null
  drinkable: Drinkable | null
  creator?: { id: string | null }
  /** País y demarcación (provincia / distrito / département…). Los publica `Font`. */
  country?: string | null
  region?: string | null
  /** Municipio exacto (límites del IGN). Nulo fuera de España, donde no hay fronteras. */
  municipality?: string | null
  createdAt: string
  /** Id de la fuente buena si ésta es un duplicado. `null` si está en pie. */
  duplicateOf?: string | null
  /** Cuándo se retiró del mapa por no existir ya. `null` si sigue ahí. */
  retiredAt?: string | null
  /** `pending` o `hidden_*` si la fuente está en cuarentena de moderación. */
  moderationState?: string
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
  /** Avisos por correo al ser mencionado (solo en respuestas propias). */
  mentionEmails?: boolean | null
  /** Avisos del sistema, por grupos. Solo en la respuesta propia. */
  pushFontUpdates?: boolean | null
  pushMentions?: boolean | null
  pushAdmin?: boolean | null
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
  lang: string | null
  signupSource: string | null
  anonymized: boolean
  createdAt: string | null
  supportClickedAt: string | null
  aixetaClickedAt: string | null
  moderationStrikes: number
  postingRestrictedUntil: string | null
}

export interface Flag {
  id: string
  flaggerName: string | null
  targetType: 'comment' | 'font' | 'photo' | 'cover_photo_removal' | 'source_limit_exemption'
  targetID: string
  fontID: string | null
  reason: string | null
  createdAt: string
  targetText: string | null
  targetImage: string | null
  targetAuthorID: string | null
  targetAuthorName: string | null
  targetAuthorCreatedAt: string | null
  targetAuthorStrikes: number
  targetAuthorRestrictedUntil: string | null
  fontName: string | null
  fontLatitude: number | null
  fontLongitude: number | null
  fontModerationState: string | null
}

export interface ModerationSource {
  id: string
  name: string | null
  latitude: number
  longitude: number
  image: string | null
  createdAt: string | null
  authorID: string | null
  authorName: string
  authorCreatedAt: string | null
  moderationStrikes: number
  postingRestrictedUntil: string | null
}

export interface FontInfoSnapshot {
  name: string | null
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
  /** División administrativa superior, como código ISO 3166-2. */
  admin1: string | null
  count: number
}

export interface LoginResponse {
  token: string
  expiresAt: string | null
  user: UserResponse
  isNewUser?: boolean
}

export interface ReportResponse {
  id: string
  fontID: string
  userID: string | null
  username: string | null
  /** Rol de quien lo escribió, solo si es del equipo. `null` para todos los demás. */
  staff?: UserRole | null
  message: string
  createdAt: string
  /** Nulo = sigue abierta. Se cierra, no se borra: la avería es parte de la historia. */
  resolvedAt: string | null
  resolvedBy: string | null
}

export interface CommentResponse {
  id: string
  fontID: string
  userID: string | null
  username: string | null
  /** Rol de quien la escribió, solo si es del equipo. */
  staff?: UserRole | null
  body: string
  rating: number | null
  waterStatus: string | null
  image: string | null
  createdAt: string
  confirmations: number
  confirmedByMe: boolean
  lastConfirmedAt: string | null
  /** Esta foto ha pasado además a ser la portada de la fuente (solo al publicarla). */
  coverAdopted: boolean
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
  latestConfirmations: number
  recentStatusReporters: number
  recentStatusConflict: boolean
}

/** Agregado exacto del mapa cuando el viewport contiene demasiadas fuentes. */
export interface MapCluster {
  latitude: number
  longitude: number
  count: number
}

export interface MapResponse {
  total: number
  fonts: FontSummary[]
  clusters: MapCluster[]
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
  /** Nivel al que subirás cuando liquide lo pendiente, si mejora al actual. */
  pendingLevel?: string | null
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
    /** `disabled` · `provisional` · `optedOut` · `restricted` · `activeDays` · `recentlyVoided` · `gotes` */
    blockedBy: string[]
    /** Lo que aún no tienes, con el nivel que lo abre. */
    upcoming?: { key: string; level: string; gotes: number }[]
  } | null
  /** La vitrina: los diez peldaños de abajo arriba. */
  levels: LevelStanding[]
  /** Todas las familias de insignias, conseguidas o no. */
  collection: BadgeSlot[]
  /** Las especiales. Aparte de `collection` porque no tienen progreso: o la tienes o no. */
  special?: SpecialStanding[]
}

/** Una insignia especial vista desde un perfil. */
export interface SpecialStanding {
  key: string
  /** ISO, o `null` si no la tiene. El servidor lo escribe explícito. */
  earnedAt: string | null
  /** Plazas libres si tiene cupo; `null` si es ilimitada. */
  remaining: number | null
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
  /** Grado que tendrás cuando liquide lo pendiente, si mejora al que ya tienes. */
  pendingTier: string | null
}

/** Una parada de una ruta propuesta (`GET /missions`). */
export interface MissionTarget {
  id: string
  name: string | null
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
  admin1: string | null
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

/**
 * El objetivo de barrio: las N fuentes más cercanas a un punto.
 *
 * No es una zona administrativa y no sale en ninguna lista — es una tarjeta calculada
 * desde tus coordenadas. Ver `ZoneStats.local` en el servidor para el porqué.
 */
export interface ZoneLocal {
  /**
   * En qué país estás, deducido de las fuentes de alrededor (el más repetido de las 30).
   *
   * Puede no venir: si alrededor no hay ninguna fuente clasificada, el servidor no lo
   * inventa. Opcional **y** nullable a propósito — aquí «no viene» y «null» significan
   * lo mismo, «no lo sé», así que no hace falta el codificador explícito que sí necesitan
   * `tier` y `fromDays`.
   */
  country?: string | null
  /** Cuántas ha juntado. Menos de 30 si alrededor no hay más. */
  fonts: number
  /** Hasta dónde ha tenido que llegar, en km. */
  radiusKm: number
  withPhoto: number
  checkedRecently: number
  photoPct: number
  freshPct: number
  /** Cuánta gente distinta ha reseñado alguna de ellas. Sin nombres, solo cuántos. */
  contributors: number
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
