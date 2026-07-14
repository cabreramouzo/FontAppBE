import { useCallback, useEffect, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../leafletSetup'
import type { Font } from '../api/types'
import { apiFetch } from '../api/client'

// Centro por defecto: comarca del Moianès.
const MOIANES: [number, number] = [41.81, 2.09]

function FontMarkers() {
  const [fonts, setFonts] = useState<Font[]>([])

  const loadBounds = useCallback(async (map: LeafletMap) => {
    const b = map.getBounds()
    const params = new URLSearchParams({
      minLat: String(b.getSouth()),
      maxLat: String(b.getNorth()),
      minLong: String(b.getWest()),
      maxLong: String(b.getEast()),
    })
    try {
      setFonts(await apiFetch<Font[]>(`/fonts/in-bounds?${params}`))
    } catch {
      // silencioso: mapa vacío si falla
    }
  }, [])

  const map = useMapEvents({
    moveend: () => loadBounds(map),
  })

  useEffect(() => {
    // El contenedor puede no tener su tamaño final al montar: forzamos el recálculo.
    const t = setTimeout(() => {
      map.invalidateSize()
      loadBounds(map)
    }, 100)
    return () => clearTimeout(t)
  }, [map, loadBounds])

  return (
    <>
      {fonts.map((f) => (
        <Marker key={f.id} position={[f.latitude, f.longitude]}>
          <Popup>
            <strong>{f.name}</strong>
            {f.description && <div className="muted">{f.description}</div>}
            <div>
              <Link to={`/fonts/${f.id}`}>Ver detalle →</Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

export function MapPage() {
  return (
    <div className="map-wrap">
      <MapContainer center={MOIANES} zoom={12} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FontMarkers />
      </MapContainer>
    </div>
  )
}
