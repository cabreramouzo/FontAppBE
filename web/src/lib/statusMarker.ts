import L from 'leaflet'
import { statusColor } from './waterStatus'

/** Icono de marcador (pin) coloreado según el estado del agua. */
export function statusIcon(status: string | null): L.DivIcon {
  const color = statusColor(status)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 25 13 25s13-15.3 13-25C26 5.8 20.2 0 13 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="13" cy="13" r="4.5" fill="white"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: 'status-pin',
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -34],
  })
}
