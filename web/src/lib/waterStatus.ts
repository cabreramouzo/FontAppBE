export interface WaterStatusInfo {
  label: string
  emoji: string
}

export const WATER_STATUS: Record<string, WaterStatusInfo> = {
  flowing: { label: 'Sale agua', emoji: '💧' },
  trickle: { label: 'Poca agua', emoji: '💦' },
  dry: { label: 'Seca', emoji: '🚱' },
  unknown: { label: 'Se desconoce', emoji: '❔' },
}

export const WATER_STATUS_OPTIONS = ['flowing', 'trickle', 'dry', 'unknown'] as const

export function waterStatusInfo(key: string | null): WaterStatusInfo | null {
  return key ? WATER_STATUS[key] ?? null : null
}
