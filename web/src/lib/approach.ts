/**
 * Los últimos metros: cuándo guiar hacia una fuente y hacia dónde.
 *
 * ## El problema
 *
 * Lo contó un usuario que va en bici de montaña: «paso por un pueblo y no sé dónde está
 * la fuente», «sé que en ese parque tiene que haber una y no la encuentro». No es un fallo
 * del mapa —el punto está bien— sino de los **últimos doscientos metros**, que es justo
 * donde ninguna app de navegación ayuda: te llevan a una calle, y la fuente está detrás
 * del quiosco, dentro del parque, donde no hay calle a la que llevarte.
 *
 * La app ya tenía las dos piezas —la posición en vivo y la brújula del cono de
 * orientación— pero solo las usaba el mapa, para pintarte a ti. Aquí se usan para lo
 * contrario: apuntar a la fuente.
 *
 * ## Las tres fases, y por qué la tercera existe
 *
 * Lo que hace honesta a esta función es **dejar de apuntar cuando apuntar sería mentir**.
 * Un GPS de móvil da ±10 m en campo abierto y bastante peor entre edificios o bajo copa.
 * Si estás a 8 m de la fuente y el margen es ±12, la flecha apunta al ruido: girará sola
 * mientras estás quieto y te mandará en círculos, que es peor que no decir nada. Por eso
 * el corte de llegada **no es fijo**, sale del margen que declara el propio aparato.
 *
 * Y ahí, precisamente, es donde la foto y la descripción de la ficha valen más que
 * cualquier flecha: «junto a la pista de petanca» resuelve lo que el GPS ya no puede.
 */

/** Desde dónde empieza a guiar. */
export const RADIO_GUIA_M = 150

/**
 * Suelo del radio de llegada, en metros.
 *
 * 15 m es el orden de magnitud del error de un GPS de móvil en buenas condiciones, así que
 * por debajo de eso la dirección ya no es información aunque el aparato diga que sí. Si
 * declara un margen peor, manda el suyo.
 */
export const RADIO_LLEGADA_M = 15

export type Guia =
  /** Demasiado lejos: esto no se pinta. Para llegar hasta aquí están el mapa y las indicaciones. */
  | { fase: 'lejos' }
  /** Estás encima. No se apunta: a esta distancia la flecha sería ruido del GPS. */
  | { fase: 'llegando' }
  /**
   * Guiando. `giro` son los grados que hay que girar **desde donde miras**: 0 al frente,
   * 90 a la derecha, 180 detrás. Es `null` cuando no hay brújula fiable — entonces se
   * enseña la distancia y ninguna flecha, que es la regla de siempre en esta app.
   */
  | { fase: 'guiando'; giro: number | null }

/**
 * Rumbo desde un punto a otro, en grados desde el norte (0 = norte, 90 = este).
 *
 * Es el rumbo **inicial** de la ortodrómica. A escala de metros la diferencia con una
 * recta es irrelevante, pero la fórmula es la misma y no cuesta nada tenerla bien.
 */
export function rumbo(desdeLat: number, desdeLong: number, aLat: number, aLong: number): number {
  const r = Math.PI / 180
  const dLong = (aLong - desdeLong) * r
  const f1 = desdeLat * r
  const f2 = aLat * r
  const y = Math.sin(dLong) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dLong)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Qué enseñar, dado dónde estás y hacia dónde miras.
 *
 * @param distanciaM  Distancia a la fuente, en metros.
 * @param precisionM  Margen que declara el GPS (`coords.accuracy`), o `null` si no lo dice.
 * @param heading     Hacia dónde mira el aparato, en grados desde el norte, o `null`.
 * @param rumboFuente Rumbo hacia la fuente, en grados desde el norte.
 */
export function guia(
  distanciaM: number,
  precisionM: number | null,
  heading: number | null,
  rumboFuente: number,
): Guia {
  if (!Number.isFinite(distanciaM) || distanciaM > RADIO_GUIA_M) return { fase: 'lejos' }

  // El corte de llegada lo manda el peor de los dos: el suelo fijo o lo que declare el
  // aparato. Con ±40 m de margen, «a 30 m hacia allá» es una dirección inventada.
  const llegada = Math.max(RADIO_LLEGADA_M, precisionM ?? 0)
  if (distanciaM <= llegada) return { fase: 'llegando' }

  if (heading === null) return { fase: 'guiando', giro: null }
  return { fase: 'guiando', giro: ((rumboFuente - heading) % 360 + 360) % 360 }
}
