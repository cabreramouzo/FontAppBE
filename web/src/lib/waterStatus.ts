export interface WaterStatusInfo {
  label: string
  emoji: string
  color: string
}

export const WATER_STATUS: Record<string, WaterStatusInfo> = {
  flowing: { label: 'Sale agua', emoji: '💧', color: '#22c55e' },
  trickle: { label: 'Poca agua', emoji: '💦', color: '#f59e0b' },
  dry: { label: 'Seca', emoji: '🚱', color: '#ef4444' },
  unknown: { label: 'Se desconoce', emoji: '❔', color: '#9ca3af' },
}

export const WATER_STATUS_OPTIONS = ['flowing', 'trickle', 'dry', 'unknown'] as const

/** Color para fuentes sin ningún estado reportado. */
export const NO_STATUS_COLOR = '#3b82f6'

export function waterStatusInfo(key: string | null): WaterStatusInfo | null {
  return key ? WATER_STATUS[key] ?? null : null
}

export function statusColor(key: string | null): string {
  return (key && WATER_STATUS[key]?.color) || NO_STATUS_COLOR
}
