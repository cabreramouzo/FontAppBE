import L from 'leaflet'

/**
 * Marcador de la ubicación del usuario, estilo iOS: un punto azul con borde
 * blanco y una onda expansiva que late, para no confundirlo con una fuente.
 */
export function userLocationIcon(): L.DivIcon {
  const size = 22
  const html = `<div class="me-loc"><span class="me-loc__pulse"></span><span class="me-loc__dot"></span></div>`
  return L.divIcon({
    html,
    className: 'me-loc-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}
