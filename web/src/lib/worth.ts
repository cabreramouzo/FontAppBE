import { getGamificationScale } from '../api/client'

/**
 * Cuánto paga comprobar una fuente **ahora mismo**, según cuánto lleve sin comprobar.
 *
 * ## Por qué existe
 *
 * La curva de frescura es lo mejor diseñado del baremo —una fuente que nadie mira desde
 * hace un año paga 70 gotas y una comprobada ayer paga 5, catorce veces más— y hasta ahora
 * era **invisible justo cuando se decide a cuál ir**. El usuario veía «hace 8 meses» y
 * tenía que saberse el baremo de memoria para entender que eso era una oportunidad.
 *
 * Es el mismo truco que las motos de alquiler que pagan más por las que están lejos: el
 * incentivo solo funciona si se ve **antes** de decidir, no después de haber ido.
 *
 * ## Las cifras no están escritas aquí
 *
 * Vienen de `/gamification/scale`, como todo lo demás de esta parte. El baremo se ha
 * recalibrado varias veces y un cartel que promete 70 gotas cuando el servidor paga 50 es
 * peor que no poner cartel. Se pide una vez por sesión y se comparte.
 */
export interface Tramo {
  /** Días desde la última comprobación a partir de los cuales aplica. `null` = nunca comprobada. */
  fromDays: number | null
  gotes: number
}

let curva: Promise<Tramo[]> | null = null

export function freshnessCurve(): Promise<Tramo[]> {
  if (!curva) curva = getGamificationScale().then((e) => e.freshness ?? []).catch(() => [])
  return curva
}

/**
 * Gotas que pagaría una reseña de actualización, o `null` si no se puede saber.
 *
 * `days === null` es «nunca la ha comprobado nadie», que es el tramo mejor pagado y el
 * caso mayoritario: de las casi 60.000 fuentes de la base, 34 se han comprobado alguna
 * vez. Se busca ese tramo por su `fromDays` nulo y no por el último de la lista, porque el
 * orden de la respuesta no es un contrato.
 */
export function worthNow(days: number | null, tramos: Tramo[]): number | null {
  if (tramos.length === 0) return null
  if (days === null) return tramos.find((t) => t.fromDays === null)?.gotes ?? null
  const escalones = tramos.filter((t): t is Tramo & { fromDays: number } => t.fromDays !== null)
    .sort((a, b) => a.fromDays - b.fromDays)
  let out: number | null = null
  for (const t of escalones) if (days >= t.fromDays) out = t.gotes
  return out
}

/**
 * ¿Merece la pena señalarlo? Solo se destaca lo que de verdad paga más de lo normal.
 *
 * Sin este corte habría una etiqueta en cada fuente del mapa, incluidas las que pagan 5
 * gotas, y una señal que sale siempre no señala nada. El umbral es el tercer escalón de la
 * curva (más de 30 días sin comprobar), que es donde el pago ya se ha multiplicado por
 * siete respecto a una fuente recién vista.
 */
export function isWorthHighlighting(days: number | null): boolean {
  return days === null || days > 30
}
