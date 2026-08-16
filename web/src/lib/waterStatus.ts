// Estado del agua: emoji y color son fijos; la etiqueta se traduce vía i18n
// con la clave `status.<key>` (ver dictionaries.ts).

export interface WaterStatusInfo {
  key: string
  emoji: string
  color: string
}

export const WATER_STATUS: Record<string, WaterStatusInfo> = {
  flowing: { key: 'flowing', emoji: '💧', color: '#22c55e' },
  trickle: { key: 'trickle', emoji: '💦', color: '#f59e0b' },
  dry: { key: 'dry', emoji: '🚱', color: '#ef4444' },
  // `broken` y `gone` hablan de la fuente, no del agua. Antes solo cabían en el texto
  // libre de la reseña, donde no las lee ni el mapa ni la ficha.
  broken: { key: 'broken', emoji: '🛠️', color: '#a855f7' },
  gone: { key: 'gone', emoji: '🪦', color: '#6b7280' },
  unknown: { key: 'unknown', emoji: '❔', color: '#9ca3af' },
}

// El orden es el del desplegable, y va de mejor a peor noticia. `unknown` cierra la
// lista porque es la salida para quien no sabe, no un estado más de la fuente.
export const WATER_STATUS_OPTIONS = ['flowing', 'trickle', 'dry', 'broken', 'gone', 'unknown'] as const

/** Color para fuentes sin ningún estado reportado. */
export const NO_STATUS_COLOR = '#3b82f6'

export function waterStatusInfo(key: string | null): WaterStatusInfo | null {
  return key ? WATER_STATUS[key] ?? null : null
}

export function statusColor(key: string | null): string {
  return (key && WATER_STATUS[key]?.color) || NO_STATUS_COLOR
}

/** Clave i18n de la etiqueta de un estado (para usar con `t()`). */
export function statusLabelKey(key: string): string {
  return `status.${key}`
}
