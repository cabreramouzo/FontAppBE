import type { PhotoUploadMeta } from '../lib/image'
import type { AdminUser, AppPlatform, CommentResponse, Drinkable, FavoriteStatus, Feedback, Flag, Font, FontEdit, FontSummary, GamificationProfile, InterestStats, LoginResponse, Missions, MyComment, Page, RegionStat, ReportResponse, StaffMember, UserResponse, UserRole, WaterSource, ZoneCoverageResponse, ZoneLocal, ZoneRanking } from './types'

// Dev: Vite hace proxy de /api -> backend (ver vite.config.ts).
// Prod: VITE_API_URL apunta al origen real del backend (p. ej. https://api.fontapp.com).
const BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'fontapp_token'

/** Resuelve una ruta del backend (p. ej. /uploads/x) a URL absoluta cuando hay VITE_API_URL. */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return (import.meta.env.VITE_API_URL || '') + path
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number // 0 = fallo de red / servidor inalcanzable
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Traduce un error de red/API a un mensaje legible en el idioma actual. */
export function describeError(e: unknown, t: (key: string) => string): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return t('error.network')
    if (e.status === 401) return t('error.unauthorized')
    return e.message || t('error.generic')
  }
  return (e as Error)?.message || t('error.generic')
}

async function parse(res: Response) {
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new ApiError(res.status, data?.reason ?? res.statusText)
  }
  return data
}

// Sin timeout, `fetch` puede quedarse colgado varios MINUTOS con cobertura mala (la
// conexión se abre pero no avanza), y la app se queda en "enviando…" para siempre.
// Cortamos pronto para poder avisar o encolar. Las subidas de foto van por multipart
// y son legítimamente más lentas, así que tienen más margen.
const REQUEST_TIMEOUT_MS = 12_000
const UPLOAD_TIMEOUT_MS = 45_000

/** fetch con timeout; cualquier fallo de red (o corte por tiempo) es ApiError(0). */
async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  const isUpload = init?.body instanceof FormData
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), isUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch {
    throw new ApiError(0, 'network')
  } finally {
    clearTimeout(timer)
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await safeFetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 204) return undefined as T
  return (await parse(res)) as T
}

/** Login con Basic auth (usuario:contraseña) -> token. */
export async function loginRequest(username: string, password: string): Promise<LoginResponse> {
  const res = await safeFetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`) },
  })
  return (await parse(res)) as LoginResponse
}

/** Sube una imagen (multipart) y devuelve su URL relativa. */
export async function uploadImage(file: File, meta?: PhotoUploadMeta): Promise<string> {
  const form = new FormData()
  // El EXIF va aparte porque la imagen que se sube ya no lo lleva: la compresión con
  // canvas lo borra. Ver `prepararFoto`.
  if (meta?.takenAt) form.append('takenAt', meta.takenAt)
  if (meta?.lat != null) form.append('latitude', String(meta.lat))
  if (meta?.lon != null) form.append('longitude', String(meta.lon))
  form.append('file', file)
  const res = await apiFetch<{ url: string }>('/images', { method: 'POST', body: form })
  return res.url
}

export interface NewFont {
  name: string
  latitude: number
  longitude: number
  image?: string
  description?: string
  source?: WaterSource
  drinkable?: Drinkable
}

export async function createFont(data: NewFont, queuedOffline = false): Promise<Font> {
  const f = await apiFetch<Font>('/fonts', {
    method: 'POST', body: JSON.stringify(data),
    headers: queuedOffline ? { 'X-FontApp-Queued-Offline': '1' } : undefined,
  })
  avisaDeAportacion()
  return f
}

/**
 * Quién puso la primera foto de una fuente. Público.
 *
 * Lo resuelve el servidor porque la ficha no puede: si la foto llegó por el formulario de
 * editar, el rastro está en el historial de ediciones, que es de moderación. Devuelve
 * `null` cuando la fuente no tiene foto o cuando de verdad no consta.
 */
export async function getFontPhotoAuthor(id: string): Promise<string | null> {
  const r = await apiFetch<{ username: string | null }>(`/fonts/${id}/photo-author`)
  return r.username ?? null
}

/** Tipo de imagen secundaria. `document` nunca es portada. */
export type PhotoKind = 'fountain' | 'document' | 'context'

export interface FontPhoto {
  id: string
  url: string
  kind: PhotoKind
  caption: string | null
  createdAt: string | null
  uploader: { id: string | null; username: string | null }
}

/**
 * La galería de una fuente. **Se pide solo al abrirla.**
 *
 * La portada sigue viniendo en `fonts.image`, que es una columna: así el mapa y el
 * listado no pagan nada por una galería que casi nadie va a abrir.
 */
export async function getFontPhotos(fontID: string): Promise<FontPhoto[]> {
  return apiFetch<FontPhoto[]>(`/fonts/${fontID}/photos`)
}

export async function addFontPhoto(
  fontID: string,
  data: { url: string; kind: PhotoKind; caption?: string },
): Promise<FontPhoto> {
  return apiFetch<FontPhoto>(`/fonts/${fontID}/photos`, { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteFontPhoto(fontID: string, photoID: string): Promise<void> {
  await apiFetch(`/fonts/${fontID}/photos/${photoID}`, { method: 'DELETE' })
}

export async function updateFont(id: string, data: NewFont): Promise<Font> {
  return apiFetch<Font>(`/fonts/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

/**
 * Fuentes cercanas a un punto, ya ordenadas por distancia por el servidor.
 *
 * Las escondidas (duplicadas, retiradas) no vienen: `Font.visible` las filtra. Es lo que
 * hace que el buscador de duplicados no ofrezca como «buena» una ficha que tampoco sale.
 */
export async function nearbyFonts(lat: number, long: number, quantity = 40): Promise<FontSummary[]> {
  return apiFetch<FontSummary[]>(`/fonts/near?lat=${lat}&long=${long}&quantity=${quantity}`)
}

/** Historial de cambios de una fuente. Nivel 4 (`viewFontHistory`) o admin. */
export async function getFontHistory(id: string): Promise<FontEdit[]> {
  return apiFetch<FontEdit[]>(`/fonts/${id}/history`)
}

/** Marca esta fuente como duplicada de `of`. Reversible: no borra nada. */
export async function markDuplicate(id: string, of: string): Promise<Font> {
  return apiFetch<Font>(`/fonts/${id}/duplicate-of`, { method: 'POST', body: JSON.stringify({ of }) })
}

export async function unmarkDuplicate(id: string): Promise<Font> {
  return apiFetch<Font>(`/fonts/${id}/duplicate-of`, { method: 'DELETE' })
}

/** Retira del mapa una fuente que ya no existe. Pide dos testimonios `gone`. */
export async function retireFont(id: string): Promise<Font> {
  return apiFetch<Font>(`/fonts/${id}/retire`, { method: 'POST' })
}

export async function unretireFont(id: string): Promise<Font> {
  return apiFetch<Font>(`/fonts/${id}/retire`, { method: 'DELETE' })
}

export async function deleteFont(id: string): Promise<void> {
  await apiFetch(`/fonts/${id}`, { method: 'DELETE' })
}

// Promueve la foto de una reseña a foto principal de la fuente (creador/admin).
export async function setFontPhotoFromComment(fontID: string, commentID: string): Promise<Font> {
  return apiFetch<Font>(`/fonts/${fontID}/photo/from-comment/${commentID}`, { method: 'POST' })
}

// Pone la foto de la fuente, y nada más. No es una edición de la ficha: no manda nombre
// ni coordenadas, así que no puede pisar lo que haya corregido otro mientras tanto.
export async function setFontPhoto(fontID: string, image: string, queuedOffline = false): Promise<Font> {
  const f = await apiFetch<Font>(`/fonts/${fontID}/photo`, {
    method: 'PUT',
    body: JSON.stringify({ image }),
    headers: queuedOffline ? { 'X-FontApp-Queued-Offline': '1' } : undefined,
  })
  avisaDeAportacion()
  return f
}

// Actualiza el perfil propio (self-only). Manda los campos actuales + los cambios.
export async function updateProfile(id: string, data: { name: string; username: string; email: string; emailPublic?: boolean; namePublic?: boolean; weeklyDigest?: boolean; gamificationOptOut?: boolean; mentionEmails?: boolean }): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export interface NewComment {
  body?: string
  rating?: number
  waterStatus?: string
  image?: string
}

export async function createComment(fontID: string, data: NewComment, queuedOffline = false): Promise<CommentResponse> {
  const c = await apiFetch<CommentResponse>(`/fonts/${fontID}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: queuedOffline ? { 'X-FontApp-Queued-Offline': '1' } : undefined,
  })
  avisaDeAportacion()
  return c
}

/**
 * Acabas de aportar algo. Lo escucha la felicitación de insignias.
 *
 * El aviso se dispara aquí y no en cada formulario porque los sitios desde los que se
 * crea una fuente o una reseña son varios —la ficha, el mapa, la bandeja de salida al
 * recuperar la cobertura— y uno de ellos se habría quedado fuera.
 */
function avisaDeAportacion() {
  try {
    window.dispatchEvent(new CustomEvent('fontapp:contributed'))
  } catch {
    // en un contexto sin `window` (tests, worker) no hay a quién avisar
  }
}

export async function updateComment(fontID: string, commentID: string, data: NewComment): Promise<CommentResponse> {
  return apiFetch<CommentResponse>(`/fonts/${fontID}/comments/${commentID}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteComment(fontID: string, commentID: string): Promise<void> {
  await apiFetch(`/fonts/${fontID}/comments/${commentID}`, { method: 'DELETE' })
}

/** 👍 "sigue igual": confirma (o deshace) que el estado del comentario sigue vigente. */
export async function confirmComment(fontID: string, commentID: string, on: boolean): Promise<CommentResponse> {
  return apiFetch<CommentResponse>(`/fonts/${fontID}/comments/${commentID}/confirm`, {
    method: on ? 'POST' : 'DELETE',
  })
}

export async function createReport(fontID: string, message: string): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(`/fonts/${fontID}/report`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

/** Cerrar (o reabrir) una incidencia. Cerrar no la borra: queda con fecha y autor. */
export async function resolveReport(fontID: string, reportID: string, on: boolean): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(`/fonts/${fontID}/report/${reportID}/resolve`, {
    method: on ? 'POST' : 'DELETE',
  })
}

export async function deleteReport(fontID: string, reportID: string): Promise<void> {
  await apiFetch(`/fonts/${fontID}/report/${reportID}`, { method: 'DELETE' })
}

// Perfil: fuentes y reseñas del usuario autenticado.
export async function getMyFonts(): Promise<Font[]> {
  return apiFetch<Font[]>('/auth/me/fonts')
}

export async function getMyComments(): Promise<MyComment[]> {
  return apiFetch<MyComment[]>('/auth/me/comments')
}

// Fuentes guardadas por el usuario autenticado (más recientes primero).
export async function getMyFavorites(): Promise<Font[]> {
  return apiFetch<Font[]>('/auth/me/favorites')
}

// Estado de favorito de una fuente. Auth opcional: sin token solo trae el recuento.
export async function getFavoriteStatus(fontID: string): Promise<FavoriteStatus> {
  return apiFetch<FavoriteStatus>(`/fonts/${fontID}/favorite`)
}

// Guarda (on=true) o deja de guardar (on=false) una fuente como favorita.
export async function setFavorite(fontID: string, on: boolean): Promise<FavoriteStatus> {
  return apiFetch<FavoriteStatus>(`/fonts/${fontID}/favorite`, { method: on ? 'POST' : 'DELETE' })
}

export async function deleteAccount(userID: string): Promise<void> {
  await apiFetch(`/users/${userID}`, { method: 'DELETE' })
}

// Recuperación de contraseña. forgot devuelve devLink solo fuera de producción.
// `lang` localiza el correo (idioma de la interfaz).
export async function forgotPassword(email: string, lang?: string): Promise<{ ok: boolean; devLink: string | null }> {
  return apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email, lang }) })
}

// Baja del resumen semanal desde el enlace del correo: no requiere sesión, el token
// firmado que viaja en la URL es la única credencial (ver UnsubscribeToken en el backend).
/** Una fuente que cuidas: tu reseña es la última que tiene. */
export interface Guarded {
  fontID: string
  name: string
  lastCheck: string
  days: number
  /** Ya ha pasado del corte de 90 días. */
  stale: boolean
}

/**
 * Las fuentes que cuidas, las más olvidadas primero.
 *
 * Aparte de `/gamification/me` porque tiene su propio coste y solo la paga quien abre esa
 * pantalla. Y no depende de tener la gamificación encendida: cuidar no es puntuar.
 */
export async function guardedFonts(): Promise<Guarded[]> {
  return apiFetch<Guarded[]>('/gamification/guarded')
}

/** Un aviso de la campana. `fontID` nulo = la fuente ya no existe. */
export interface NotificationItem {
  id: string
  kind: 'mention' | 'staleGuarded' | 'fontUpdate'
  actorName: string
  fontID: string | null
  fontName: string
  excerpt: string
  read: boolean
  createdAt: string | null
}

/**
 * La bandeja propia. **No marca nada como leído**: eso lo hace `markNotificationsRead`
 * cuando se abre el panel, o cualquier carga de la app te vaciaría la campana antes de
 * que la miraras.
 */
export async function getNotifications(): Promise<{ unread: number; items: NotificationItem[] }> {
  return apiFetch('/notifications')
}

export async function markNotificationsRead(): Promise<void> {
  await apiFetch('/notifications/read', { method: 'POST' })
}

export async function unsubscribeWeekly(user: string, token: string, kind?: string): Promise<void> {
  await apiFetch('/users/unsubscribe', { method: 'POST', body: JSON.stringify({ user, token, kind }) })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
}

// Actividad reciente (solo admin de momento): fuentes nuevas, reseñas, incidencias
// y ediciones mezcladas en una línea de tiempo.
export interface ActivityItem {
  kind: 'fontAdded' | 'review' | 'report' | 'edit'
  fontID: string
  fontName: string
  region: string | null
  author: string | null
  waterStatus: string | null
  text: string | null
  /** Foto de la reseña o de la fuente; nula si no hay ninguna. */
  image: string | null
  createdAt: string
}

export async function getActivity(
  opts: { limit?: number; region?: string; lat?: number; long?: number; km?: number } = {},
): Promise<ActivityItem[]> {
  const q = new URLSearchParams()
  if (opts.limit) q.set('limit', String(opts.limit))
  if (opts.region) q.set('region', opts.region)
  // Cercanía: manda sobre la región si vienen las dos (lo decide el backend).
  if (opts.lat !== undefined && opts.long !== undefined) {
    q.set('lat', String(opts.lat))
    q.set('long', String(opts.long))
    if (opts.km) q.set('km', String(opts.km))
  }
  return apiFetch(`/activity?${q}`)
}

/** El pulso de la competición: quién ha subido de nivel y quién lo tiene a tiro. */
export interface PulsePromotion {
  username: string
  /** Clave de nivel; el rótulo lo pone el navegador. */
  level: string
  gotes: number
}

export interface PulseClimber {
  username: string
  nextLevel: string
  gotes: number
  remaining: number
  pct: number
}

export interface PulseSnapshot {
  promotions: PulsePromotion[]
  climbers: PulseClimber[]
}

export async function getPulse(): Promise<PulseSnapshot> {
  return apiFetch('/activity/pulse')
}

/**
 * Insignias conseguidas por alguien. Público, y solo lo conseguido: familia y grado,
 * sin el progreso que sí lleva la vitrina propia.
 *
 * Lista vacía si esa persona ha apagado la gamificación o está anonimizada.
 */
export interface PublicBadge {
  family: string
  /** `special` son las de `SpecialBadges`: viajan en la misma lista para que el perfil
   *  público las pinte juntas y la celebración las detecte sin saber que existen. */
  tier: 'bronze' | 'silver' | 'gold' | 'unique' | 'special'
}

/**
 * El baremo, tal cual está en el backend. Lo pinta la pantalla de ayuda.
 *
 * Viene del servidor y no está escrito aquí a propósito: copiado, el día que se
 * recalibre una base la ayuda seguiría enseñando la vieja, y una explicación que no
 * cuadra con tu marcador es peor que no dar ninguna.
 */
export interface GamificationScale {
  kinds: { kind: string; base: number }[]
  multipliers: { key: string; factor: number }[]
  maxMultiplier: number
  desertKm: number
  dryMonths: number[]
  crowdedFrom: number
  dailyCap: number
  settleHours: number
  freshness: { fromDays: number | null; gotes: number }[]
  /** La escalera de niveles, de abajo arriba. Sin sesión: la usa `/gamification`. */
  levels: { key: string; from: number }[]
  /** Las familias de insignias con sus umbrales (uno solo si son de grado único). */
  families: { key: string; thresholds: number[]; unique: boolean }[]
  /** Las especiales: un hecho, no un contador. `limit` es el cupo total (null = sin
   *  cupo). Las plazas **libres** no vienen aquí — esta ruta no toca la base de datos;
   *  se ven en `/gamification/me`. */
  specials: { key: string; limit: number | null }[]
  /** Qué abre cada nivel. Se publica aunque el sistema esté apagado. */
  capabilities: { key: string; level: string; gotes: number; enabled?: boolean }[]
  /** `false` mientras las capacidades no concedan nada todavía. */
  capabilitiesEnabled: boolean
  /** Días distintos con aportación que hacen falta además de las gotas. */
  capabilityActiveDays: number
}

export async function getGamificationScale(): Promise<GamificationScale> {
  return apiFetch('/gamification/scale')
}

/**
 * Lo que ya te has ganado contando también lo pendiente de liquidar.
 *
 * Solo lo usa la felicitación, para poder darla en el momento. Todo lo demás —marcador,
 * vitrina, ranking, lo que ven los demás— sigue contando solo lo liquidado.
 */
export async function getMyBadgesPreview(): Promise<PublicGamification> {
  const r = await apiFetch<PublicGamification>('/gamification/badges/preview')
  return { badges: r.badges ?? [], level: r.level ?? null }
}

export async function getUserBadges(userID: string): Promise<PublicBadge[]> {
  return (await getUserGamification(userID)).badges
}

/** Lo público de la gamificación de alguien: su nivel y lo que ha ganado. */
export interface PublicGamification {
  badges: PublicBadge[]
  /** Clave del nivel. `null` solo si tiene la gamificación apagada o la cuenta
   *  anonimizada — con cero gotas el nivel es «Gota», que es donde empieza todo el
   *  mundo. */
  level: string | null
}

export async function getUserGamification(userID: string): Promise<PublicGamification> {
  const r = await apiFetch<PublicGamification>(`/users/${encodeURIComponent(userID)}/badges`)
  // `level` puede faltar si el backend es más viejo que esta pantalla: `?? null` evita
  // que la diferencia entre `undefined` y `null` vuelva a costar una pantalla.
  return { badges: r.badges ?? [], level: r.level ?? null }
}

// Altas por código de cartel (?p=…). `source` nulo = llegaron sin código.
export async function getSourceStats(): Promise<{ source: string | null; count: number }[]> {
  return apiFetch('/users/stats/sources')
}

// Altas desde una fecha, para el distintivo de "usuarios nuevos" del panel (admin).
export async function getNewUsers(since: string): Promise<{ count: number; since: string }> {
  return apiFetch(`/users/stats/new?since=${encodeURIComponent(since)}`)
}

// Resumen semanal (solo propietario): la vista previa no envía nada; el POST sí.
export interface DigestResult {
  candidates: number
  recipients: { username: string; email: string; activityCount: number; nearbyCount: number }[]
  skipped: number
  failed: number
  sent: boolean
}

export async function previewWeeklyDigest(): Promise<DigestResult> {
  return apiFetch('/admin/weekly-digest')
}

export async function sendWeeklyDigest(): Promise<DigestResult> {
  return apiFetch('/admin/weekly-digest', { method: 'POST' })
}

// Moderación: denunciar contenido; listar/descartar denuncias (admin).
export async function createFlag(targetType: 'comment' | 'font', targetID: string, fontID?: string, reason?: string): Promise<void> {
  await apiFetch('/flags', { method: 'POST', body: JSON.stringify({ targetType, targetID, fontID, reason }) })
}

export async function getFlags(): Promise<Flag[]> {
  return apiFetch<Flag[]>('/flags')
}

export async function dismissFlag(id: string): Promise<void> {
  await apiFetch(`/flags/${id}`, { method: 'DELETE' })
}

// Historial de ediciones de información de fuentes (admin): listar, revertir, revisar.
export const FONT_EDITS_PER = 50

// `unreviewed`: solo la cola pendiente (panel). `per`: tamaño de página.
export async function getFontEdits(page = 1, opts: { unreviewed?: boolean; per?: number } = {}): Promise<FontEdit[]> {
  const q = new URLSearchParams({ page: String(page), per: String(opts.per ?? FONT_EDITS_PER) })
  if (opts.unreviewed) q.set('unreviewed', 'true')
  return apiFetch<FontEdit[]>(`/fonts/edits?${q}`)
}

export async function revertFontEdit(editID: string): Promise<Font> {
  return apiFetch<Font>(`/fonts/edits/${editID}/revert`, { method: 'POST' })
}

// ✓ Marca una edición como revisada (la saca de la cola del panel). No cambia la fuente.
export async function reviewFontEdit(editID: string): Promise<void> {
  await apiFetch(`/fonts/edits/${editID}/review`, { method: 'POST' })
}

// Estadística de usuarios por región de registro (admin).
export async function getRegionStats(): Promise<RegionStat[]> {
  return apiFetch<RegionStat[]>('/users/stats/regions')
}

// Interés por una app móvil nativa (banner). Voto público; si hay token se liga al usuario.
export async function submitAppInterest(wants: boolean, platform?: AppPlatform): Promise<void> {
  await apiFetch('/interest', { method: 'POST', body: JSON.stringify({ wants, platform }) })
}

// Estadística de interés por app móvil (admin).
export async function getInterestStats(): Promise<InterestStats> {
  return apiFetch<InterestStats>('/interest/stats')
}

// Sugerencia / feedback libre (mensaje + país/email opcionales). Auth opcional.
export async function submitFeedback(data: { message: string; country?: string; email?: string }): Promise<void> {
  await apiFetch('/feedback', { method: 'POST', body: JSON.stringify(data) })
}

// Lista de sugerencias (admin).
export async function getFeedback(): Promise<Feedback[]> {
  return apiFetch<Feedback[]>('/feedback')
}

// Gestión de roles (solo owner): listar el equipo y cambiar el rol de un usuario.
export async function getStaff(): Promise<StaffMember[]> {
  return apiFetch<StaffMember[]>('/users/staff')
}

export async function setUserRole(userID: string, role: UserRole): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/users/${userID}/role`, { method: 'PUT', body: JSON.stringify({ role }) })
}

// Listado completo de usuarios, paginado y con búsqueda (solo owner).
export const USERS_ADMIN_PER = 25

export async function getUsersAdmin(page = 1, search = ''): Promise<Page<AdminUser>> {
  const q = new URLSearchParams({ page: String(page), per: String(USERS_ADMIN_PER) })
  if (search.trim()) q.set('search', search.trim())
  return apiFetch<Page<AdminUser>>(`/users/admin?${q}`)
}

// Perfil público de un usuario: identidad + su actividad (fuentes y reseñas).
export async function getUser(id: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/users/${id}`)
}

export async function getUserFonts(id: string): Promise<Font[]> {
  return apiFetch<Font[]>(`/users/${id}/fonts`)
}

export async function getUserComments(id: string): Promise<MyComment[]> {
  return apiFetch<MyComment[]>(`/users/${id}/comments`)
}

/**
 * Marcador de gamificación. Devuelve `null` si el usuario la tiene apagada — el backend
 * responde 204 y no es un error: es que no hay nada que enseñar.
 */
export async function getGamification(): Promise<GamificationProfile | null> {
  // 204 (apagada) llega como `undefined` desde apiFetch; se normaliza a null.
  return (await apiFetch<GamificationProfile | undefined>('/gamification/me')) ?? null
}

/** Rutas propuestas alrededor de un punto. Lectura pública. */
export async function getMissions(lat: number, long: number, km?: number): Promise<Missions> {
  const q = new URLSearchParams({ lat: String(lat), long: String(long) })
  if (km) q.set('km', String(km))
  return apiFetch<Missions>(`/missions?${q}`)
}

/** EXIF de una foto: lo que escribió el móvil. **Solo admins** (403 para el resto). */
export interface PhotoExifMeta {
  photoID: string
  /** Cuándo dice la cámara que se hizo. */
  takenAt: string | null
  /** Cuándo se subió. La distancia entre las dos es el dato que interesa. */
  uploadedAt: string | null
  latitude: number | null
  longitude: number | null
}

export async function photoExif(ids: string[]): Promise<PhotoExifMeta[]> {
  if (ids.length === 0) return []
  return apiFetch<PhotoExifMeta[]>(`/images/meta?ids=${ids.join(',')}`)
}

/** Cobertura por zona (fase 5). Pública. */
export async function getZones(): Promise<ZoneCoverageResponse> {
  return apiFetch<ZoneCoverageResponse>('/zones')
}

/** El objetivo de barrio alrededor de un punto (fase 5). Pública. */
export async function getLocalZone(lat: number, long: number): Promise<ZoneLocal> {
  const q = new URLSearchParams({ lat: String(lat), long: String(long) })
  return apiFetch<ZoneLocal>(`/zones/local?${q}`)
}

/** Ranking mensual de una zona. `month` en AAAA-MM; si falta, el mes en curso. */
export async function getZoneRanking(region: string, month?: string): Promise<ZoneRanking> {
  const q = new URLSearchParams({ region })
  if (month) q.set('month', month)
  return apiFetch<ZoneRanking>(`/zones/ranking?${q}`)
}
