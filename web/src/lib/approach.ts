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
 *
 * **Dejar de apuntar no es haber llegado**, y durante un tiempo se dijeron con el mismo
 * número: bajo arbolado, con ±40 m declarados, la app daba por llegado a alguien que
 * estaba a cuarenta metros. Son dos preguntas distintas y hoy se contestan por separado;
 * el porqué está en `guia()`.
 */

/** Desde dónde empieza a guiar. */
export const RADIO_GUIA_M = 150

/**
 * Suelo del radio de llegada, en metros.
 *
 * Empezó en 15, con el argumento de que es el orden de magnitud del error de un GPS de
 * móvil en buenas condiciones. **Probándolo sobre el terreno resultó ser demasiado
 * pronto**: a 15 m de una fuente todavía no la has visto —es el ancho de una plaza— y la
 * app ya decía «ya estás» y dejaba de apuntar justo cuando aún hacía falta.
 *
 * El fallo del razonamiento es que 15 era **una suposición** puesta como suelo por encima
 * de un dato medido.
 *
 * Ojo, esto ya no es un suelo sobre `accuracy`: desde que llegar y poder apuntar son dos
 * decisiones distintas (ver `guia()`), **este número decide la llegada él solo**. Es una
 * distancia real —a cinco metros de una fuente la estás viendo— y no depende de lo que el
 * aparato diga de sí mismo, precisamente porque con mala señal sabes menos.
 */
export const RADIO_LLEGADA_M = 5

export type Guia =
  /** Demasiado lejos: esto no se pinta. Para llegar hasta aquí están el mapa y las indicaciones. */
  | { fase: 'lejos' }
  /** Estás encima. No se apunta: a esta distancia la flecha sería ruido del GPS. */
  | { fase: 'llegando' }
  /**
   * Cerca, pero **no se puede apuntar**: el margen que declara el GPS se come la distancia
   * que queda. No es lo mismo que haber llegado y no se dice como si lo fuera.
   */
  | { fase: 'cerca'; distanciaM: number }
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

  // ## Dos preguntas distintas, y antes las contestaba un solo número
  //
  // El corte era `max(suelo, precisión)` para las dos cosas, así que bajo copa —donde el
  // móvil declara ±30 o ±40 m— la app decía **«ya estás» estando a cuarenta metros**.
  // Reportado desde el bosque. Y bajar el suelo no lo arregla: en ese caso el suelo no
  // manda, manda `precisionM`.
  //
  // Lo que hay que separar es:
  //
  // - **¿He llegado?** Es una distancia real y no depende de lo que el aparato sepa de sí
  //   mismo. Con mala señal sabes **menos**, así que hay que ser MÁS prudente al afirmar
  //   que has llegado, no menos. Va contra el suelo fijo y nada más.
  // - **¿Puedo apuntar?** Ahí sí manda `precisionM`: si lo que queda cabe dentro del
  //   margen, la flecha gira sola estando quieto y te manda en círculos.
  //
  // Entre las dos aparece el caso del bosque: cerca, sin poder apuntar, y **sin haber
  // llegado**. Es justo donde la foto y la descripción valen más que cualquier flecha.
  if (distanciaM <= RADIO_LLEGADA_M) return { fase: 'llegando' }
  if (distanciaM <= (precisionM ?? 0)) return { fase: 'cerca', distanciaM }

  if (heading === null) return { fase: 'guiando', giro: null }
  return { fase: 'guiando', giro: ((rumboFuente - heading) % 360 + 360) % 360 }
}
