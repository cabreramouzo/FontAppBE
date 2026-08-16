/**
 * Cuánto hace que alguien comprobó una fuente.
 *
 * Es la señal que la app le debía al usuario desde el principio: «¿hay agua?» es una
 * pregunta sobre hoy, y una reseña de hace dos años responde a otra cosa. Hasta ahora solo
 * había un aviso cuando el estado pasaba de 30 días; el caso mayoritario —las ~53.000
 * fuentes importadas que **nadie ha comprobado nunca**— no decía nada, que es justo el que
 * más falta hace señalar.
 *
 * Sale de la fase 4 del plan de gamificación (docs/gamificacion.md), pero es útil por sí
 * sola: si mañana se cancelan los puntos, esto se queda. Ese era el criterio para hacerla
 * antes que las misiones.
 */
export type FreshnessLevel = 'week' | 'month' | 'old' | 'never'

const DAY = 24 * 3600 * 1000

export interface Freshness {
  level: FreshnessLevel
  /** Días transcurridos, o `null` si no se ha comprobado nunca. */
  days: number | null
}

/**
 * Los cortes son los mismos que usa la curva de frescura del baremo (7 y 30 días), para
 * que lo que el usuario ve y lo que el sistema paga cuenten la misma historia. Si «esta
 * semana» en pantalla no coincidiera con «esta semana» en los puntos, la explicación de
 * por qué una aportación vale poco dejaría de sostenerse.
 */
export function freshnessOf(lastCheck: string | null | undefined): Freshness {
  if (!lastCheck) return { level: 'never', days: null }
  const days = Math.floor((Date.now() - new Date(lastCheck).getTime()) / DAY)
  if (Number.isNaN(days)) return { level: 'never', days: null }
  if (days <= 7) return { level: 'week', days }
  if (days <= 30) return { level: 'month', days }
  return { level: 'old', days }
}

/** Clave de traducción del rótulo. */
export function freshnessLabelKey(level: FreshnessLevel): string {
  return `fresh.${level}`
}

/**
 * Color semántico. «Nunca comprobada» va en gris y no en rojo a propósito: no es un
 * problema de la fuente, es una tarea pendiente nuestra, y pintar de rojo media Catalunya
 * convertiría el mapa en una alarma constante que se deja de mirar.
 */
export function freshnessColor(level: FreshnessLevel): 'success' | 'info' | 'warning' | 'default' {
  switch (level) {
    case 'week': return 'success'
    case 'month': return 'info'
    case 'old': return 'warning'
    case 'never': return 'default'
  }
}
