/**
 * Girar el mapa arrastrando la brújula, como Mapas del Mac.
 *
 * En escritorio no hay gesto de dos dedos, así que sin esto el mapa no se puede girar de
 * ninguna forma. La brújula pasa a ser un mando: la agarras y giras. La geometría vive
 * aquí, pura y con tests, porque es trigonometría con casos límite (el salto por 360°, el
 * signo de la pantalla) que fallan en silencio y no se ven hasta arrastrar en un ratón.
 */

/**
 * Ángulo del puntero respecto a un centro, en grados. Usa `atan2(dy, dx)` con la Y de la
 * PANTALLA (hacia abajo), así que crece en sentido HORARIO: mover el puntero en el sentido
 * de las agujas alrededor del centro aumenta el ángulo. No se normaliza aquí: lo que
 * importa es la diferencia entre dos lecturas, y `bearingArrastrando` ya envuelve.
 */
export function anguloPuntero(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI
}

/**
 * Nuevo bearing del mapa al arrastrar: gira lo mismo que el puntero alrededor del centro
 * de la brújula. **Agarre relativo** —parte del bearing que había y del ángulo donde
 * agarraste—, así que no da ningún salto al empezar a arrastrar. Normalizado a [0, 360).
 */
export function bearingArrastrando(
  bearingInicial: number,
  anguloInicial: number,
  anguloActual: number,
): number {
  const delta = anguloActual - anguloInicial
  return (((bearingInicial + delta) % 360) + 360) % 360
}

/** ¿El movimiento del puntero fue un arrastre o un clic? Por debajo del umbral (px) es un
 *  clic —enderezar el norte—; por encima, un giro. Evita que un clic tembloroso gire. */
export function esArrastre(dx: number, dy: number, umbralPx = 4): boolean {
  return Math.hypot(dx, dy) >= umbralPx
}

/**
 * Qué punto cardinal está ARRIBA del mapa, para escribirlo en la brújula (como Mapas del
 * Mac). En leaflet-rotate `setBearing(b)` deja arriba la dirección `-b`, así que arriba
 * está `(360 - bearing)`; se redondea al cardinal más cercano. Devuelve la clave N/E/S/W;
 * la letra visible (O en vez de W en las lenguas romances) la pone el diccionario.
 */
export function cardinalArriba(bearing: number): 'N' | 'E' | 'S' | 'W' {
  const arriba = (((360 - bearing) % 360) + 360) % 360
  return (['N', 'E', 'S', 'W'] as const)[Math.round(arriba / 90) % 4]
}
