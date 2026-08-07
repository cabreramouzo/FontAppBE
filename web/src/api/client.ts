import type { AdminUser, AppPlatform, CommentResponse, Drinkable, FavoriteStatus, Feedback, Flag, Font, FontEdit, InterestStats, LoginResponse, MyComment, Page, RegionStat, ReportResponse, StaffMember, UserResponse, UserRole, WaterSource } from './types'

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

/** fetch con captura del fallo de red como ApiError(0). */
async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch {
    throw new ApiError(0, 'network')
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
export async function updateProfile(id: string, data: { name: string; username: string; email: string; emailPublic?: boolean; namePublic?: boolean }): Promise<UserResponse> {
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

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
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
