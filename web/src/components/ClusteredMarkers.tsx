import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { FontSummary, MapCluster } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { statusIcon } from '../lib/statusMarker'
import { waterStatusInfo } from '../lib/waterStatus'
import { drinkableInfo, sourceInfo } from '../lib/waterType'
import { isStale, timeAgo } from '../lib/time'
import { nombreFuente } from '../lib/fontName'
import { CONFIDENCE_EMOJI, confidenceDetailKey, confidenceLabelKey, confidenceOf } from '../lib/confidence'
import { trackInteraction } from '../api/client'

const HEATMAP_MAX_ZOOM = 6

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
export function ClusteredMarkers({
  fonts, clusters, selectedID,
}: { fonts: FontSummary[]; clusters: MapCluster[]; selectedID?: string | null }) {
  const map = useMap()
  const navigate = useNavigate()
  const { t } = useI18n()
  // Fuente cuyo popup ha cerrado el usuario a mano. Los marcadores se reconstruyen con
  // cada movimiento del mapa, y sin esto el popup volvía a salir una y otra vez.
  const cerradoPorElUsuario = useRef<string | null>(null)
  // Y la inversa: fuente cuyo popup está abierto AHORA, para reponerlo. Reconstruir los
  // marcadores destruye el popup, y eso solo se compensaba para la fuente enfocada; el
  // que abres tocando un pin —el caso normal— se perdía. Con el GPS detrás de ti el mapa
  // se recentra cada pocos segundos, así que desaparecía solo al segundo de abrirlo.
  const popupAbierto = useRef<string | null>(null)

  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 })
    const serverClusters = L.layerGroup()
    let selectedMarker: L.Marker | null = null
    const porID = new Map<string, L.Marker>()

    // Los dos únicos cierres deliberados: el aspa del popup y tocar el mapa.
    const cerrarAMano = () => {
      if (popupAbierto.current === selectedID) cerradoPorElUsuario.current = selectedID ?? null
      popupAbierto.current = null
    }
    map.on('click', cerrarAMano)

    for (const f of fonts) {
      const isSelected = !!f.id && f.id === selectedID
      const marker = L.marker([f.latitude, f.longitude], { icon: statusIcon(f.lastWaterStatus, isSelected) })
      const ws = waterStatusInfo(f.lastWaterStatus)
      const src = sourceInfo(f.source)
      const dr = drinkableInfo(f.drinkable)
      const stale = f.lastUpdate ? isStale(f.lastUpdate) : false
      const confidence = confidenceOf(f)
      const srcText = src ? `${src.emoji} ${t(src.labelKey)}` : ''
      const drText = dr ? `${dr.emoji} ${t(dr.labelKey)}` : ''
      const el = document.createElement('div')
      // Todo el popup es UN enlace, no solo el botón: en un mapa se toca con el pulgar
      // mientras andas y el objetivo pequeño es el problema. Y va como `<a>` de verdad y
      // no como un `<div>` con un `onclick`, para que siga funcionando con teclado, con
      // «abrir en pestaña nueva» y con un lector de pantalla.
      //
      // El botón de dentro se queda como **señal**: sin algo que parezca pulsable, nadie
      // descubre que la tarjeta entera lo es. Por eso es un `<span>` y no otro enlace —
      // un enlace dentro de otro no es HTML válido.
      el.innerHTML = `
        <a href="/fonts/${f.id}" class="popup-card">
          <strong>${escapeHtml(nombreFuente(f, t))}</strong>
          <div class="muted small">${srcText}${src && dr ? ' · ' : ''}${drText}</div>
          ${ws ? `<div class="badge">${ws.emoji} ${t(`status.${ws.key}`)}</div>` : ''}
          <div class="muted small" title="${escapeHtml(t(confidenceDetailKey(confidence)))}">${CONFIDENCE_EMOJI[confidence]} ${escapeHtml(t(confidenceLabelKey(confidence)))}</div>
          ${f.lastUpdate ? `<div class="muted small">${t('popup.updated', { when: timeAgo(f.lastUpdate, t) })}${stale ? ' ⚠️' : ''}</div>` : ''}
          <span class="popup-link">${t('popup.detail')}</span>
        </a>`
      el.querySelector('.popup-card')?.addEventListener('click', (e) => {
        e.preventDefault()
        navigate(`/fonts/${f.id}`)
      })
      // autoPan off: al enfocar centramos el pin nosotros (arriba, sobre la lista);
      // el autoPan de Leaflet lo recentraba y quedaba tapado por el bottom-sheet.
      marker.bindPopup(el, { autoPan: false })
      marker.on('popupopen', () => {
        popupAbierto.current = f.id
        // Abrir el popup de otra fuente cuenta como descartar el de la enfocada: si no,
        // al reponer ganaría ella y le robaría el popup al pin que acabas de tocar.
        cerradoPorElUsuario.current = isSelected ? null : (selectedID ?? null)
        // El aspa es el ÚNICO cierre que se apunta desde aquí. `popupclose` no vale:
        // markercluster quita y repone marcadores al agrupar, y nuestro propio ciclo de
        // vida los quita enteros — los dos disparan `popupclose` sin que nadie haya
        // cerrado nada, y eso es justo lo que hay que reponer, no olvidar.
        const aspa = marker.getPopup()?.getElement()?.querySelector('.leaflet-popup-close-button')
        aspa?.addEventListener('click', cerrarAMano, { once: true })
      })
      porID.set(f.id, marker)
      if (isSelected) {
        // Suelta sobre el mapa (fuera del cluster) → siempre visible.
        selectedMarker = marker
        marker.addTo(map)
      } else {
        group.addLayer(marker)
      }
    }
    map.addLayer(group)

    for (const cluster of clusters) {
      const density = cluster.count < 100 ? 'small' : cluster.count < 1_000 ? 'medium' : 'large'
      const size = density === 'small' ? 34 : density === 'medium' ? 40 : 48
      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: L.divIcon({
          className: `server-map-cluster server-map-cluster--${density}`,
          html: `<span>${cluster.count.toLocaleString()}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        title: t('map.clusterCount', { n: cluster.count }),
      })
      marker.on('click', () => {
        trackInteraction('map_cluster_click')
        map.setView([cluster.latitude, cluster.longitude], Math.min(18, map.getZoom() + 2))
      })
      serverClusters.addLayer(marker)
    }

    // En una vista de país/continente, decenas de etiquetas numéricas esconden justo
    // lo que se quiere explorar. El mismo agregado exacto se dibuja entonces como una
    // capa de densidad Canvas; al acercarse reaparecen clusters tocables y después pins.
    const heatCanvas = document.createElement('canvas')
    heatCanvas.className = 'server-map-heatmap'
    heatCanvas.setAttribute('aria-hidden', 'true')
    map.getPanes().overlayPane.appendChild(heatCanvas)
    let drawFrame: number | null = null

    const heatIsVisible = () => clusters.length > 0 && map.getZoom() <= HEATMAP_MAX_ZOOM
    const drawHeatmap = () => {
      drawFrame = null
      if (!heatIsVisible()) {
        heatCanvas.hidden = true
        return
      }
      heatCanvas.hidden = false
      const size = map.getSize()
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      heatCanvas.width = Math.round(size.x * ratio)
      heatCanvas.height = Math.round(size.y * ratio)
      heatCanvas.style.width = `${size.x}px`
      heatCanvas.style.height = `${size.y}px`
      L.DomUtil.setPosition(heatCanvas, map.containerPointToLayerPoint([0, 0]))
      const ctx = heatCanvas.getContext('2d')
      if (!ctx) return
      ctx.scale(ratio, ratio)
      ctx.clearRect(0, 0, size.x, size.y)
      const maxLog = Math.max(...clusters.map((c) => Math.log1p(c.count)), 1)

      // Los focos ligeros se pintan primero y los densos encima: así una gran ciudad
      // conserva un núcleo reconocible sin convertir todo el territorio en una mancha.
      for (const cluster of [...clusters].sort((a, b) => a.count - b.count)) {
        const point = map.latLngToContainerPoint([cluster.latitude, cluster.longitude])
        const weight = Math.log1p(cluster.count) / maxLog
        const radius = 22 + 28 * weight
        if (point.x < -radius || point.y < -radius || point.x > size.x + radius || point.y > size.y + radius) continue
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)
        gradient.addColorStop(0, `rgba(239, 83, 80, ${0.32 + 0.28 * weight})`)
        gradient.addColorStop(0.32, `rgba(251, 192, 45, ${0.24 + 0.20 * weight})`)
        gradient.addColorStop(0.68, `rgba(102, 187, 106, ${0.12 + 0.14 * weight})`)
        gradient.addColorStop(1, 'rgba(102, 187, 106, 0)')
        ctx.fillStyle = gradient
        ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2)
      }
    }
    const scheduleHeatmap = () => {
      if (drawFrame === null) drawFrame = window.requestAnimationFrame(drawHeatmap)
    }
    const syncDensityMode = () => {
      if (heatIsVisible()) {
        if (map.hasLayer(serverClusters)) map.removeLayer(serverClusters)
      } else if (clusters.length > 0 && !map.hasLayer(serverClusters)) {
        map.addLayer(serverClusters)
      }
      scheduleHeatmap()
    }
    const zoomIntoHeat = (event: L.LeafletMouseEvent) => {
      if (!heatIsVisible()) return
      const click = map.latLngToContainerPoint(event.latlng)
      const closest = clusters.reduce<{ cluster: MapCluster; distance: number } | null>((best, cluster) => {
        const point = map.latLngToContainerPoint([cluster.latitude, cluster.longitude])
        const distance = point.distanceTo(click)
        return !best || distance < best.distance ? { cluster, distance } : best
      }, null)
      if (closest && closest.distance <= 50) {
        trackInteraction('map_heatmap_click')
        map.setView([closest.cluster.latitude, closest.cluster.longitude], map.getZoom() + 2)
      }
    }
    map.on('move zoom resize', scheduleHeatmap)
    map.on('zoomend', syncDensityMode)
    map.on('click', zoomIntoHeat)
    syncDensityMode()

    // Repone el popup que estuviera abierto. Manda el seleccionado —salvo que el usuario
    // ya lo hubiera descartado— y si no, el que abrió tocando un pin. Nunca movemos el
    // mapa: el encuadre es cosa de <FocusOn>.
    const reponer = () => {
      if (selectedMarker && cerradoPorElUsuario.current !== selectedID) {
        if (!selectedMarker.isPopupOpen()) selectedMarker.openPopup()
        return
      }
      const m = popupAbierto.current ? porID.get(popupAbierto.current) : undefined
      if (m && map.hasLayer(m) && !m.isPopupOpen()) m.openPopup()
    }
    reponer()
    // Al hacer zoom, markercluster agrupa y desagrupa: quita el marcador y lo vuelve a
    // poner sin que esto se reconstruya, así que el popup también hay que reponerlo ahí.
    group.on('animationend', reponer)

    return () => {
      map.off('click', cerrarAMano)
      map.off('click', zoomIntoHeat)
      map.off('move zoom resize', scheduleHeatmap)
      map.off('zoomend', syncDensityMode)
      group.off('animationend', reponer)
      map.removeLayer(group)
      if (map.hasLayer(serverClusters)) map.removeLayer(serverClusters)
      if (drawFrame !== null) window.cancelAnimationFrame(drawFrame)
      heatCanvas.remove()
      if (selectedMarker) map.removeLayer(selectedMarker)
    }
  }, [fonts, clusters, map, navigate, t, selectedID])

  return null
}
