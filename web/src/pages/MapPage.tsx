import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { LatLng, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../leafletSetup'
import type { FontSummary } from '../api/types'
import { apiFetch, createFont, uploadImage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { WATER_STATUS, waterStatusInfo } from '../lib/waterStatus'
import { statusIcon } from '../lib/statusMarker'
import { formatDist, haversineKm } from '../lib/geo'
import { timeAgo } from '../lib/time'

// Centro por defecto: comarca del Moianès.
const MOIANES: [number, number] = [41.81, 2.09]

const hasWater = (f: FontSummary) => f.lastWaterStatus === 'flowing' || f.lastWaterStatus === 'trickle'

function FontMarkers({ nonce, onlyWithWater }: { nonce: number; onlyWithWater: boolean }) {
  const [fonts, setFonts] = useState<FontSummary[]>([])

  const loadBounds = useCallback(async (map: LeafletMap) => {
    const b = map.getBounds()
    const params = new URLSearchParams({
      minLat: String(b.getSouth()),
      maxLat: String(b.getNorth()),
      minLong: String(b.getWest()),
      maxLong: String(b.getEast()),
    })
    try {
      setFonts(await apiFetch<FontSummary[]>(`/fonts/in-bounds?${params}`))
    } catch {
      // silencioso: mapa vacío si falla
    }
  }, [])

  const map = useMapEvents({
    moveend: () => loadBounds(map),
  })

  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize()
      loadBounds(map)
    }, 100)
    return () => clearTimeout(t)
  }, [map, loadBounds, nonce])

  const shown = onlyWithWater ? fonts.filter(hasWater) : fonts

  return (
    <>
      {shown.map((f) => {
        const ws = waterStatusInfo(f.lastWaterStatus)
        return (
          <Marker key={f.id} position={[f.latitude, f.longitude]} icon={statusIcon(f.lastWaterStatus)}>
            <Popup>
              <strong>{f.name}</strong>
              {ws && <div className="badge">{ws.emoji} {ws.label}</div>}
              {f.lastUpdate && <div className="muted small">Actualizado {timeAgo(f.lastUpdate)}</div>}
              <div>
                <Link to={`/fonts/${f.id}`}>Ver detalle →</Link>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

// Captura el clic en el mapa para situar la nueva fuente.
function PlacePicker({ onPick }: { onPick: (pos: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng) })
  return null
}

// Recentra el mapa cuando cambia el objetivo (p. ej. "cerca de mí").
function Recenter({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.setView(target, 15)
  }, [target, map])
  return null
}

function NewFontForm({ pos, onCancel, onCreated }: { pos: LatLng; onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      let image: string | undefined
      if (file) image = await uploadImage(file)
      await createFont({ name, latitude: pos.lat, longitude: pos.lng, image, description: description || undefined })
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <h3>Nueva fuente</h3>
      <p className="muted">Lat {pos.lat.toFixed(5)}, Long {pos.lng.toFixed(5)}</p>
      <form onSubmit={submit} className="col">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Crear'}</button>
          <button type="button" className="link" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

// Lista de fuentes cercanas, ordenadas por distancia, con estado y frescura.
function NearbyPanel({ pos, onClose }: { pos: [number, number]; onClose: () => void }) {
  const [items, setItems] = useState<FontSummary[]>([])

  useEffect(() => {
    apiFetch<FontSummary[]>(`/fonts/near?lat=${pos[0]}&long=${pos[1]}&quantity=25`)
      .then(setItems)
      .catch(() => setItems([]))
  }, [pos])

  return (
    <div className="nearby">
      <div className="nearby-head">
        <strong>Cerca de ti</strong>
        <button className="link" onClick={onClose}>✕</button>
      </div>
      <ul className="nearby-list">
        {items.map((f) => {
          const ws = waterStatusInfo(f.lastWaterStatus)
          const dist = haversineKm(pos[0], pos[1], f.latitude, f.longitude)
          return (
            <li key={f.id}>
              <Link to={`/fonts/${f.id}`}>
                <span className="nearby-name">{f.name}</span>
                <span className="nearby-meta muted">
                  {ws && <span title={ws.label}>{ws.emoji}</span>} {formatDist(dist)}
                  {f.lastUpdate && ` · ${timeAgo(f.lastUpdate)}`}
                </span>
              </Link>
            </li>
          )
        })}
        {items.length === 0 && <li className="muted">Sin fuentes cerca.</li>}
      </ul>
    </div>
  )
}

function MapLegend() {
  return (
    <div className="legend">
      {(['flowing', 'trickle', 'dry'] as const).map((k) => (
        <span key={k} className="legend-item">
          <span className="dot" style={{ background: WATER_STATUS[k].color }} /> {WATER_STATUS[k].label}
        </span>
      ))}
    </div>
  )
}

export function MapPage() {
  const { user } = useAuth()
  const [placing, setPlacing] = useState(false)
  const [pos, setPos] = useState<LatLng | null>(null)
  const [nonce, setNonce] = useState(0)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [geoError, setGeoError] = useState('')
  const [onlyWithWater, setOnlyWithWater] = useState(false)
  const [showNearby, setShowNearby] = useState(false)

  function cancel() {
    setPlacing(false)
    setPos(null)
  }
  function created() {
    cancel()
    setNonce((n) => n + 1) // fuerza recarga de marcadores
  }
  function locateMe() {
    setGeoError('')
    if (!navigator.geolocation) {
      setGeoError('Geolocalización no disponible')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMe([p.coords.latitude, p.coords.longitude])
        setShowNearby(true)
      },
      () => setGeoError('No se pudo obtener tu ubicación'),
    )
  }

  return (
    <div className="map-wrap">
      <MapContainer center={MOIANES} zoom={12} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FontMarkers nonce={nonce} onlyWithWater={onlyWithWater} />
        <Recenter target={me} />
        {me && <Marker position={me} />}
        {placing && <PlacePicker onPick={setPos} />}
        {pos && <Marker position={pos} />}
      </MapContainer>

      <div className="map-controls">
        <button className="ctrl" onClick={locateMe}>📍 Cerca de mí</button>
        <button className={'ctrl' + (onlyWithWater ? ' active' : '')} onClick={() => setOnlyWithWater((v) => !v)}>
          💧 Solo con agua
        </button>
      </div>
      {geoError && <div className="hint hint-error">{geoError}</div>}

      <MapLegend />

      {showNearby && me && <NearbyPanel pos={me} onClose={() => setShowNearby(false)} />}

      {user && !placing && (
        <button className="fab" onClick={() => { setPlacing(true); setPos(null) }}>
          ➕ Añadir fuente
        </button>
      )}
      {placing && !pos && (
        <div className="hint">
          Toca el mapa para situar la fuente · <button className="link" onClick={cancel}>cancelar</button>
        </div>
      )}
      {placing && pos && <NewFontForm pos={pos} onCancel={cancel} onCreated={created} />}
    </div>
  )
}
