/**
 * El botón de ubicación de tres estados, como Mapas de iOS.
 *
 * La lógica vive aquí, pura y sin React ni Leaflet, porque son decisiones con casos límite
 * que fallan **en silencio**: un ciclo mal encadenado, un modo que sigue tu posición cuando
 * no debe, o el giro de «rumbo arriba» apuntando 90° torcido no rompen nada visible en un
 * test de humo — solo se notan andando por la calle con el móvil, que es donde no llega
 * ningún test. `MapPage` y `MeMarker` importan estas funciones para que el test guarde el
 * código de verdad y no una copia.
 *
 *  · 'off'     — libre; el mapa no te sigue. Flecha hueca.
 *  · 'follow'  — centrado en ti, se desplaza contigo, norte arriba, con cono. Flecha rellena.
 *  · 'heading' — además gira el mapa a tu rumbo (rumbo arriba); aparece la brújula.
 */
export type ModoUbicacion = 'off' | 'follow' | 'heading'

/**
 * A qué estado pasa el botón al tocarlo. Cicla como Mapas de iOS:
 * off → follow → heading, y a partir de ahí alterna follow ↔ heading.
 *
 * **Salir del todo ('off') NO es cosa del botón**: se hace moviendo el mapa (ver
 * `MODO_TRAS_GESTO`). Por eso `heading` vuelve a `follow` y no a `off`: un cuarto toque
 * no puede dejar de seguirte, o el botón tendría un estado inalcanzable a mano.
 */
export function modoTrasToque(modo: ModoUbicacion): ModoUbicacion {
  if (modo === 'off') return 'follow'
  if (modo === 'follow') return 'heading'
  return 'follow'
}

/** Mover el mapa (arrastrar o hacer zoom) suelta el seguimiento: vuelve a 'off'. */
export const MODO_TRAS_GESTO: ModoUbicacion = 'off'

/**
 * El botón arranca en 'off'. Hasta tener una posición no se está siguiendo nada, y mostrar
 * 'follow' de entrada mentía: al primer arranque salía el icono relleno (estado 2) sin
 * punto azul, y al pulsar el botón `modo` iba de 'follow' a 'heading' en vez de localizar,
 * así que el punto no aparecía hasta mover el mapa. Con 'off', el primer toque localiza.
 */
export const MODO_INICIAL: ModoUbicacion = 'off'

/**
 * Qué estado MUESTRA el botón, que no es lo mismo que la intención `modo`: sin posición no
 * puedes estar siguiendo a nadie, así que se ve 'off' (hueco) aunque la intención fuera
 * seguir. Es la red de seguridad contra el estado imposible —relleno sin punto— pase lo
 * que pase con el orden de los efectos al arrancar.
 */
export function modoVisible(modo: ModoUbicacion, tienePosicion: boolean): ModoUbicacion {
  return tienePosicion ? modo : 'off'
}

/** ¿Este modo sigue tu posición? `follow` y `heading` sí; `off` no. Lo usa el watch del
 *  GPS para decidir si recentra el mapa en cada fix. */
export function sigueUbicacion(modo: ModoUbicacion): boolean {
  return modo !== 'off'
}

/** ¿Este modo orienta el mapa a tu rumbo (rumbo arriba)? Solo `heading`. */
export function orientaAlRumbo(modo: ModoUbicacion): boolean {
  return modo === 'heading'
}

/** ¿El botón va relleno con el color de acción? En cuanto empieza a seguirte. */
export function botonRelleno(modo: ModoUbicacion): boolean {
  return modo !== 'off'
}

/** Icono del botón, como clave semántica; el componente la mapea a su icono de MUI.
 *  Hueca (libre) · rellena (te sigue) · navegación (rumbo arriba), igual que iOS. */
export function iconoDeModo(modo: ModoUbicacion): 'hollow' | 'filled' | 'navigation' {
  if (modo === 'off') return 'hollow'
  if (modo === 'follow') return 'filled'
  return 'navigation'
}

/**
 * Dirección del cono del punto azul en pantalla, en grados (0 = hacia arriba), a partir de
 * tu rumbo real `heading` y del giro del mapa `bearing` (el `getBearing()` de leaflet-rotate).
 *
 * Es `heading + bearing`, NO `heading - bearing`. El signo importa y estaba al revés: en
 * leaflet-rotate `setBearing(b)` deja arriba la dirección `-b` (el pane gira +b, así que lo
 * que sube es lo que estaba a -b), de modo que un rumbo real `heading` cae en pantalla a
 * `heading - (-bearing) = heading + bearing`. Con el mapa sin girar (`bearing = 0`) da lo
 * mismo que antes, así que el cono de siempre (norte arriba) no cambia; solo se corrige
 * cuando el mapa está rotado. Normalizado a [0, 360).
 */
export function anguloConoEnPantalla(heading: number, bearing: number): number {
  return (((heading + bearing) % 360) + 360) % 360
}

/**
 * El giro del mapa (`bearing` de leaflet-rotate) que deja tu rumbo arriba.
 *
 * Es `-heading`, NO `heading`: lo confirma el propio plugin, cuyo seguimiento por brújula
 * hace `setBearing(360 - webkitCompassHeading)` en iOS (`_onDeviceOrientation`). Con
 * `heading` el mapa giraba **invertido** —reportado en un iPhone real—. Aislado aquí para
 * atar las dos fórmulas: con este giro, el cono (`heading + bearing`) queda a 0, y hay un
 * test que lo fija para cualquier rumbo. Normalizado a [0, 360).
 */
export function bearingRumboArriba(heading: number): number {
  return (((-heading) % 360) + 360) % 360
}

/**
 * Ángulo del cono del punto azul en pantalla, ya contando el modo.
 *
 * En 'heading' (rumbo arriba) es SIEMPRE 0: tu rumbo está arriba por definición. Calcularlo
 * como `heading + bearing` ahí lo hacía **parpadear** —el `heading` (sensor) y el `bearing`
 * (giro del mapa) se actualizan en instantes distintos, así que entre un fix y que el mapa
 * acabe de girar el cono saltaba y volvía, reportado en un iPhone—. Fijarlo a 0 quita el
 * salto y es lo correcto: en course-up el haz siempre apunta arriba. Fuera de ese modo se
 * calcula normal, que es lo que muestra hacia dónde miras sobre un mapa girado a mano.
 */
export function anguloDelCono(heading: number, bearing: number, rumboArriba: boolean): number {
  return rumboArriba ? 0 : anguloConoEnPantalla(heading, bearing)
}
