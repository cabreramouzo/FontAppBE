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
 * tu rumbo real `heading` y del giro del mapa `bearing`. El mapa puede estar rotado, así
 * que el rumbo se pinta a `heading - bearing`. Normalizado a [0, 360).
 */
export function anguloConoEnPantalla(heading: number, bearing: number): number {
  return (((heading - bearing) % 360) + 360) % 360
}

/**
 * El giro del mapa (`bearing`) que deja tu rumbo arriba: el que hace que el cono apunte a
 * 0. Como el cono es `heading - bearing`, ese `bearing` es el propio `heading`. Aislarlo
 * aquí ata la fórmula del cono y la del giro: si una cambia, el test de que el cono queda
 * a 0 lo caza. Normalizado a [0, 360).
 */
export function bearingRumboArriba(heading: number): number {
  return ((heading % 360) + 360) % 360
}
