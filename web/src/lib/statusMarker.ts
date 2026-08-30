import L from 'leaflet'
import { statusColor } from './waterStatus'

/**
 * Cuánto se ensancha la zona sensible del pin sin tocar el dibujo.
 *
 * El pin mide 26×38 y es **el objetivo más pulsado de la app**: por debajo de los 44 pt
 * que pide la guía de Apple, y encima se toca con el pulgar sobre un mapa en movimiento.
 * Se le añade margen transparente hasta 44×44. El de arriba y no abajo a propósito: la
 * punta del pin tiene que seguir clavada en el punto, así que la zona sensible crece
 * **hacia arriba**, que además es de donde viene el pulgar.
 *
 * **No se agranda el dibujo**, que es la tentación: pines más gordos tapan el mapa y en
 * una ciudad se solapan hasta hacerlo ilegible. Lo que crece es la zona invisible — la
 * misma distinción que hace la guía y que ya se aplicó al aspa del globo.
 *
 * El precio, dicho en voz alta: en zonas densas las zonas sensibles de pines vecinos se
 * solapan y gana el de encima. Es mejor que fallar el toque, que es lo que pasaba.
 */
const TACTIL = 44

/** Icono de marcador (pin) coloreado según el estado del agua. `selected` lo resalta. */
export function statusIcon(status: string | null, selected = false): L.DivIcon {
  const color = statusColor(status)
  const scale = selected ? 1.35 : 1
  const w = Math.round(26 * scale)
  const h = Math.round(38 * scale)
  const stroke = selected ? '#111827' : 'white'
  // overflow:visible evita que el trazo (que sobresale del path) se recorte por los lados.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 26 38" overflow="visible" style="overflow:visible">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 25 13 25s13-15.3 13-25C26 5.8 20.2 0 13 0z" fill="${color}" stroke="${stroke}" stroke-width="${selected ? 2 : 1.5}"/>
    <circle cx="13" cy="13" r="4.5" fill="white"/>
  </svg>`
  // El margen va dentro del `div` del icono: Leaflet coloca ese div por su esquina, así
  // que el ancla se corrige con la mitad del margen o el pin queda desplazado del punto.
  const margen = Math.max(0, TACTIL - w)
  const margenArriba = Math.max(0, TACTIL - h)
  const cajaW = w + margen
  const cajaH = h + margenArriba
  return L.divIcon({
    html: `<div style="padding:${margenArriba}px ${margen / 2}px 0">${svg}</div>`,
    className: selected ? 'status-pin selected' : 'status-pin',
    iconSize: [cajaW, cajaH],
    // La punta sigue en el punto: el ancla baja hasta el fondo de la caja.
    iconAnchor: [cajaW / 2, cajaH],
    popupAnchor: [0, -cajaH + 4],
  })
}
