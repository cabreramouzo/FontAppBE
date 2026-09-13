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
export function userLocationIcon(atenuado = false, nav = false): L.DivIcon {
  // Modo navegación (coche/bici): una flecha orientada al rumbo de viaje, en vez del
  // punto. La rotación la pone `--me-nav` desde fuera, como el cono, para no recrear el
  // icono a cada fix. Sin latido ni cono: apunta hacia dónde vas y ya.
  if (nav) {
    const arrow =
      '<span class="me-loc__arrow">' +
      '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 2 L20 21 L12 16 L4 21 Z" fill="#147efb" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>' +
      '</svg></span>'
    return L.divIcon({
      html: `<div class="me-loc me-loc--nav">${arrow}</div>`,
      className: 'me-loc-wrap',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
  }
  // 28 px: el de 22 dejaba un punto visible de solo 14 px, demasiado fácil de perder
  // entre carreteras, etiquetas y marcadores en una pantalla de móvil.
  const size = 28
  // Atenuado: la última posición conocida cuando el permiso ha caducado (iOS). Gris y sin
  // latido, para que se lea como «aproximado» y no se confunda con el punto en vivo.
  const clase = atenuado ? 'me-loc me-loc--stale' : 'me-loc'
  const html =
    `<div class="${clase}">` +
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
