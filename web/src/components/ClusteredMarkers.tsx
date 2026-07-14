import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { FontSummary } from '../api/types'
import { statusIcon } from '../lib/statusMarker'
import { waterStatusInfo } from '../lib/waterStatus'
import { isStale, timeAgo } from '../lib/time'

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

// Marcadores agrupados (clustering) gestionados imperativamente con leaflet.markercluster,
// para no depender de un wrapper de react-leaflet. Los popups navegan por SPA.
export function ClusteredMarkers({ fonts }: { fonts: FontSummary[] }) {
  const map = useMap()
  const navigate = useNavigate()

  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 })

    for (const f of fonts) {
      const marker = L.marker([f.latitude, f.longitude], { icon: statusIcon(f.lastWaterStatus) })
      const ws = waterStatusInfo(f.lastWaterStatus)
      const stale = f.lastUpdate ? isStale(f.lastUpdate) : false
      const el = document.createElement('div')
      el.innerHTML = `
        <strong>${escapeHtml(f.name)}</strong>
        ${ws ? `<div class="badge">${ws.emoji} ${ws.label}</div>` : ''}
        ${f.lastUpdate ? `<div class="muted small">Actualizado ${timeAgo(f.lastUpdate)}${stale ? ' ⚠️' : ''}</div>` : ''}
        <div><a href="/fonts/${f.id}" class="popup-link">Ver detalle →</a></div>`
      el.querySelector('.popup-link')?.addEventListener('click', (e) => {
        e.preventDefault()
        navigate(`/fonts/${f.id}`)
      })
      marker.bindPopup(el)
      group.addLayer(marker)
    }

    map.addLayer(group)
    return () => {
      map.removeLayer(group)
    }
  }, [fonts, map, navigate])

  return null
}
