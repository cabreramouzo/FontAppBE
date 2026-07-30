import L from 'leaflet'
import { statusColor } from './waterStatus'

/** Icono de marcador (pin) coloreado según el estado del agua. `selected` lo resalta. */
export function statusIcon(status: string | null, selected = false): L.DivIcon {
  const color = statusColor(status)
  const scale = selected ? 1.35 : 1
  const w = Math.round(26 * scale)
  const h = Math.round(38 * scale)
  const stroke = selected ? '#111827' : 'white'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 26 38">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 25 13 25s13-15.3 13-25C26 5.8 20.2 0 13 0z" fill="${color}" stroke="${stroke}" stroke-width="${selected ? 2 : 1.5}"/>
    <circle cx="13" cy="13" r="4.5" fill="white"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: selected ? 'status-pin selected' : 'status-pin',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 4],
  })
}
