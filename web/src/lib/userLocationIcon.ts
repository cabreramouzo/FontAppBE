import L from 'leaflet'

/**
 * Marcador de la ubicación del usuario, estilo iOS: un punto azul con borde
 * blanco y una onda expansiva que late, para no confundirlo con una fuente.
 *
 * Encima lleva el cono de orientación (hacia dónde mira el móvil). Se pinta siempre
 * pero nace oculto: lo enciende `MeMarker` cuando la brújula da un ángulo de verdad,
 * cambiando dos variables CSS. Así el ángulo se actualiza sin recrear el icono, que
 * haría parpadear el marcador con cada latido del sensor.
 */
export function userLocationIcon(): L.DivIcon {
  // 28 px: el de 22 dejaba un punto visible de solo 14 px, demasiado fácil de perder
  // entre carreteras, etiquetas y marcadores en una pantalla de móvil.
  const size = 28
  const html =
    `<div class="me-loc">` +
    `<span class="me-loc__cone"></span>` +
    `<span class="me-loc__pulse"></span>` +
    `<span class="me-loc__dot"></span>` +
    `</div>`
  return L.divIcon({
    html,
    className: 'me-loc-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}
