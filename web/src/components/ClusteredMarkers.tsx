import { useEffect, useRef } from 'react'
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
export function ClusteredMarkers({ fonts, selectedID }: { fonts: FontSummary[]; selectedID?: string | null }) {
  const map = useMap()
  const navigate = useNavigate()
  const { t } = useI18n()
  // Grupo y marcadores por id, para poder abrir el popup del seleccionado.
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const prevSelected = useRef<string | null>(null)

  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 })
    const byId = new Map<string, L.Marker>()

    for (const f of fonts) {
      const marker = L.marker([f.latitude, f.longitude], { icon: statusIcon(f.lastWaterStatus) })
      if (f.id) byId.set(f.id, marker)
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
      group.addLayer(marker)
    }

    map.addLayer(group)
    groupRef.current = group
    markersRef.current = byId
    return () => {
      map.removeLayer(group)
      if (groupRef.current === group) groupRef.current = null
    }
  }, [fonts, map, navigate, t])

  // Al cambiar la fuente seleccionada (o al reconstruirse los marcadores tras
  // recentrar): resalta su pin, restaura el anterior y abre su popup.
  useEffect(() => {
    const statusOf = (id: string) => fonts.find((f) => f.id === id)?.lastWaterStatus ?? null

    // Restaura el icono normal del pin previamente seleccionado.
    const prev = prevSelected.current
    if (prev && prev !== selectedID) {
      markersRef.current.get(prev)?.setIcon(statusIcon(statusOf(prev), false))
    }
    prevSelected.current = selectedID ?? null

    const group = groupRef.current
    if (!selectedID || !group) return
    const marker = markersRef.current.get(selectedID)
    if (!marker) return
    marker.setIcon(statusIcon(statusOf(selectedID), true))
    // Si el marcador ya está desclusterizado, abre el popup directamente
    // (el callback de zoomToShowLayer no dispara cuando no hay zoom que hacer).
    const visible = group.getVisibleParent(marker)
    if (!visible || visible === marker) {
      marker.openPopup()
    } else {
      group.zoomToShowLayer(marker, () => marker.openPopup())
    }
  }, [selectedID, fonts])

  return null
}
