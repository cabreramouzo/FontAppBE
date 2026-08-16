import type { AdminUser, AppPlatform, CommentResponse, Drinkable, FavoriteStatus, Feedback, Flag, Font, FontEdit, GamificationProfile, InterestStats, LoginResponse, Missions, MyComment, Page, RegionStat, ReportResponse, StaffMember, UserResponse, UserRole, WaterSource, ZoneCoverageResponse, ZoneRanking } from './types'

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
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
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

export async function createFont(data: NewFont): Promise<Font> {
  return apiFetch<Font>('/fonts', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateFont(id: string, data: NewFont): Promise<Font> {
  return apiFetch<Font>(`/fonts/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteFont(id: string): Promise<void> {
  await apiFetch(`/fonts/${id}`, { method: 'DELETE' })
}

// Promueve la foto de una reseña a foto principal de la fuente (creador/admin).
export async function setFontPhotoFromComment(fontID: string, commentID: string): Promise<Font> {
  return apiFetch<Font>(`/fonts/${fontID}/photo/from-comment/${commentID}`, { method: 'POST' })
}

// Actualiza el perfil propio (self-only). Manda los campos actuales + los cambios.
export async function updateProfile(id: string, data: { name: string; username: string; email: string; emailPublic?: boolean; namePublic?: boolean; weeklyDigest?: boolean; gamificationOptOut?: boolean }): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export interface NewComment {
  body?: string
  rating?: number
  waterStatus?: string
  image?: string
}

export async function createComment(fontID: string, data: NewComment): Promise<CommentResponse> {
  return apiFetch<CommentResponse>(`/fonts/${fontID}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
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
export async function unsubscribeWeekly(user: string, token: string): Promise<void> {
  await apiFetch('/users/unsubscribe', { method: 'POST', body: JSON.stringify({ user, token }) })
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
  tier: 'bronze' | 'silver' | 'gold' | 'unique'
}

export async function getUserBadges(userID: string): Promise<PublicBadge[]> {
  const r = await apiFetch<{ badges: PublicBadge[] }>(`/users/${encodeURIComponent(userID)}/badges`)
  return r.badges
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

/** Cobertura por zona (fase 5). Pública. */
export async function getZones(): Promise<ZoneCoverageResponse> {
  return apiFetch<ZoneCoverageResponse>('/zones')
}

/** Ranking mensual de una zona. `month` en AAAA-MM; si falta, el mes en curso. */
export async function getZoneRanking(region: string, month?: string): Promise<ZoneRanking> {
  const q = new URLSearchParams({ region })
  if (month) q.set('month', month)
  return apiFetch<ZoneRanking>(`/zones/ranking?${q}`)
}
