export type ConfidenceLevel = 'verified' | 'recent' | 'disputed' | 'stale' | 'unverified'

export interface ConfidenceEvidence {
  lastWaterStatus?: string | null
  lastUpdate?: string | null
  latestConfirmations?: number
  recentStatusReporters?: number
  recentStatusConflict?: boolean
}

export interface StatusReport {
  userID?: string | null
  waterStatus?: string | null
  createdAt: string
  lastConfirmedAt?: string | null
  confirmations?: number
}

const DAY = 86_400_000

/**
 * Confianza explicable en el estado ACTUAL de una fuente. No juzga si la fuente es
 * buena: mide cuánto respaldo tiene la información que enseñamos sobre ella.
 */
export function confidenceOf(e: ConfidenceEvidence, now = Date.now()): ConfidenceLevel {
  if (e.recentStatusConflict) return 'disputed'
  if (!e.lastWaterStatus || !e.lastUpdate) return 'unverified'
  const days = Math.floor((now - new Date(e.lastUpdate).getTime()) / DAY)
  if (!Number.isFinite(days)) return 'unverified'
  if (days > 30) return 'stale'
  if ((e.latestConfirmations ?? 0) > 0 || (e.recentStatusReporters ?? 0) > 1) return 'verified'
  return 'recent'
}

export function confidenceLabelKey(level: ConfidenceLevel): string {
  return `confidence.${level}`
}

export function confidenceDetailKey(level: ConfidenceLevel): string {
  return `confidence.${level}Detail`
}

export function isReliable(e: ConfidenceEvidence): boolean {
  return confidenceOf(e) === 'verified'
}

/** Construye la misma evidencia en la ficha, donde ya tenemos las reseñas completas. */
export function evidenceFromReports(reports: StatusReport[], now = Date.now()): ConfidenceEvidence {
  const withStatus = reports.filter((r) => !!r.waterStatus)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const latest = withStatus[0]
  if (!latest) return {}
  const recent = withStatus.filter((r) => now - new Date(r.createdAt).getTime() <= 30 * DAY && r.waterStatus !== 'unknown')
  const family = (s?: string | null) => s === 'flowing' || s === 'trickle'
    ? 'water'
    : s === 'dry' || s === 'broken' || s === 'gone' ? 'unavailable' : null
  return {
    lastWaterStatus: latest.waterStatus,
    lastUpdate: latest.lastConfirmedAt ?? latest.createdAt,
    latestConfirmations: latest.confirmations ?? 0,
    recentStatusReporters: new Set(recent.flatMap((r) => r.userID ? [r.userID] : [])).size,
    recentStatusConflict: new Set(recent.map((r) => family(r.waterStatus)).filter(Boolean)).size > 1,
  }
}

export const CONFIDENCE_EMOJI: Record<ConfidenceLevel, string> = {
  verified: '✅',
  recent: '🕐',
  disputed: '⚖️',
  stale: '⌛',
  unverified: '○',
}
