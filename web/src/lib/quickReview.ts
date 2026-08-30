/**
 * Qué hace de verdad el chip del globo del mapa: ¿una reseña nueva, o confirmar la que ya
 * hay?
 *
 * ## El problema
 *
 * Los tres chips solo sabían crear reseñas. Tocar «sale agua» sobre una fuente que ya dice
 * «sale agua» desde hace una hora publicaba un parte repetido en vez de respaldar el que
 * había, que es literalmente lo que significa el botón «sigue igual» de la ficha.
 *
 * ## La regla
 *
 * Si el chip que tocas **dice lo mismo** que el último parte y ese parte es **reciente**,
 * se confirma. Si dices otra cosa, es un desacuerdo y tiene que ser su propio parte.
 *
 * El usuario no aprende ninguna distinción: la app ya sabe cuál de las dos cosas está
 * diciendo, y hasta ahora le hacía elegir a quien no tiene el contexto delante.
 *
 * ## Por qué 7 días, y por qué el corte importa tanto
 *
 * El número **no es de diseño, sale del baremo**. `ContributionScore.freshness` es plana
 * en `case ..<8: return 5`: dentro de la primera semana, repetir la reseña paga **5 gotas**
 * y confirmar paga **10**. O sea que hasta ahí confirmar es a la vez la mejor señal y lo
 * mejor pagado, y el incentivo no hay que tocarlo.
 *
 * A partir del octavo día la curva sube (15, 35, 50, 60, 70), así que seguir convirtiendo
 * la reseña en confirmación **degradaría la aportación que más paga la app** —comprobar una
 * fuente olvidada— de 70 gotas a 10. Por eso el cambio de comportamiento muere a los 7 días
 * y no a los 30 de la ventana de confianza.
 *
 * Por lo mismo se mide contra la fecha **del parte** (`lastReportAt`) y no contra
 * `lastUpdate`, que es la más fresca entre el parte y sus confirmaciones: una fuente
 * reseñada hace un año y confirmada ayer parecería fresca, y ahí una reseña nueva vale 60.
 */

export type AccionRapida =
  | { tipo: 'resena' }
  | { tipo: 'confirmar'; commentID: string }

/** Hasta aquí llega el tramo plano de la curva de frescura. Ver el comentario de arriba. */
export const DIAS_PARA_CONFIRMAR = 7

const DIA = 86_400_000

export interface UltimoParte {
  /** El estado que el usuario acaba de tocar. */
  estado: string
  lastWaterStatus?: string | null
  lastCommentID?: string | null
  lastReportAt?: string | null
}

export function accionRapida(p: UltimoParte, ahora = Date.now()): AccionRapida {
  // Sin parte anterior identificado no hay nada que confirmar. Es el caso de las 119 de
  // cada 123 fuentes con reseña: la inmensa mayoría solo tiene una.
  if (!p.lastCommentID || !p.lastWaterStatus || !p.lastReportAt) return { tipo: 'resena' }
  // Decir algo distinto NUNCA es confirmar: es un desacuerdo, y un desacuerdo tiene que
  // quedar como parte propio o la contradicción se pierde.
  if (p.estado !== p.lastWaterStatus) return { tipo: 'resena' }
  const t = new Date(p.lastReportAt).getTime()
  if (!Number.isFinite(t)) return { tipo: 'resena' }
  const dias = Math.floor((ahora - t) / DIA)
  // Una fecha en el futuro (reloj del móvil adelantado) no puede colar como «reciente»
  // por la puerta de atrás: `dias` saldría negativo y pasaría el corte igual.
  if (dias < 0) return { tipo: 'resena' }
  if (dias > DIAS_PARA_CONFIRMAR) return { tipo: 'resena' }
  return { tipo: 'confirmar', commentID: p.lastCommentID }
}
