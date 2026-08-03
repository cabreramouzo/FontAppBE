import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { FontSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { statusIcon } from '../lib/statusMarker'
import { waterStatusInfo } from '../lib/waterStatus'
import { drinkableInfo, sourceInfo } from '../lib/waterType'
import { isStale, timeAgo } from '../lib/time'

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

// Marcadores agrupados (clustering) gestionados imperativamente con leaflet.markercluster,
// para no depender de un wrapper de react-leaflet. Los popups navegan por SPA.
//
// La fuente seleccionada NO entra en el cluster: se añade suelta sobre el mapa para
// que quede siempre visible (nunca se combina con las demás al alejar el zoom).
export function ClusteredMarkers({ fonts, selectedID }: { fonts: FontSummary[]; selectedID?: string | null }) {
  const map = useMap()
  const navigate = useNavigate()
  const { t } = useI18n()

  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 })
    let selectedMarker: L.Marker | null = null

    for (const f of fonts) {
      const isSelected = !!f.id && f.id === selectedID
      const marker = L.marker([f.latitude, f.longitude], { icon: statusIcon(f.lastWaterStatus, isSelected) })
      const ws = waterStatusInfo(f.lastWaterStatus)
      const src = sourceInfo(f.source)
      const dr = drinkableInfo(f.drinkable)
      const stale = f.lastUpdate ? isStale(f.lastUpdate) : false
      const srcText = src ? `${src.emoji} ${t(src.labelKey)}` : ''
      const drText = dr ? `${dr.emoji} ${t(dr.labelKey)}` : ''
      const el = document.createElement('div')
      el.innerHTML = `
        <strong>${escapeHtml(f.name)}</strong>
        <div class="muted small">${srcText}${src && dr ? ' · ' : ''}${drText}</div>
        ${ws ? `<div class="badge">${ws.emoji} ${t(`status.${ws.key}`)}</div>` : ''}
        ${f.lastUpdate ? `<div class="muted small">${t('popup.updated', { when: timeAgo(f.lastUpdate, t) })}${stale ? ' ⚠️' : ''}</div>` : ''}
        <div><a href="/fonts/${f.id}" class="popup-link">${t('popup.detail')}</a></div>`
      el.querySelector('.popup-link')?.addEventListener('click', (e) => {
        e.preventDefault()
        navigate(`/fonts/${f.id}`)
      })
      // autoPan off: al enfocar centramos el pin nosotros (arriba, sobre la lista);
      // el autoPan de Leaflet lo recentraba y quedaba tapado por el bottom-sheet.
      marker.bindPopup(el, { autoPan: false })
      if (isSelected) {
        // Suelta sobre el mapa (fuera del cluster) → siempre visible.
        selectedMarker = marker
        marker.addTo(map)
      } else {
        group.addLayer(marker)
      }
    }
    map.addLayer(group)

    // Popup del seleccionado. Al reconstruirse los marcadores (zoom/pan) también lo
    // reabrimos, pero nunca movemos el mapa; el encuadre es cosa de <FocusOn>.
    if (selectedMarker) selectedMarker.openPopup()

    return () => {
      map.removeLayer(group)
      if (selectedMarker) map.removeLayer(selectedMarker)
    }
  }, [fonts, map, navigate, t, selectedID])

  return null
}
