import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { LatLng, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../leafletSetup'
import type { Font, FontSummary, Page } from '../api/types'
import { apiFetch, createFont, uploadImage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ClusteredMarkers } from '../components/ClusteredMarkers'
import { WATER_STATUS, waterStatusInfo } from '../lib/waterStatus'
import { formatDist, haversineKm } from '../lib/geo'
import { compressImage } from '../lib/image'
import { isNotPotable } from '../lib/waterType'
import { timeAgo } from '../lib/time'

// Centro por defecto: comarca del Moianès.
const MOIANES: [number, number] = [41.81, 2.09]

const hasWater = (f: FontSummary) => f.lastWaterStatus === 'flowing' || f.lastWaterStatus === 'trickle'

function FontMarkers({ nonce, onlyWithWater, showNonPotable }: { nonce: number; onlyWithWater: boolean; showNonPotable: boolean }) {
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

  let shown = showNonPotable ? fonts : fonts.filter((f) => !isNotPotable(f.drinkable))
  if (onlyWithWater) shown = shown.filter(hasWater)
  return <ClusteredMarkers fonts={shown} />
}

// Captura el clic en el mapa para situar la nueva fuente.
function PlacePicker({ onPick }: { onPick: (pos: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng) })
  return null
}

// Recentra el mapa cuando cambia el objetivo (cerca de mí / búsqueda).
function Recenter({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.setView(target, 16)
  }, [target, map])
  return null
}

function SearchBox({ onSelect }: { onSelect: (f: Font) => void }) {
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<Font[]>([])

  // Búsqueda en el servidor (escala a cualquier tamaño), con debounce.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setMatches([])
      return
    }
    const t = setTimeout(() => {
      apiFetch<Page<Font>>(`/fonts?search=${encodeURIComponent(term)}&per=8`)
        .then((p) => setMatches(p.items))
        .catch(() => setMatches([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Buscar fuente…" />
      {matches.length > 0 && (
        <ul className="search-list">
          {matches.map((f) => (
            <li key={f.id}>
              <button className="search-item" onClick={() => { onSelect(f); setQ(''); setMatches([]) }}>{f.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
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
      if (file) image = await uploadImage(await compressImage(file))
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
  const [items, setItems] = useState<FontSummary[] | null>(null)

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
        {items === null && <li className="muted">Cargando…</li>}
        {items?.map((f) => {
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
        {items?.length === 0 && <li className="muted">Sin fuentes cerca.</li>}
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
  const [goto, setGoto] = useState<[number, number] | null>(null)
  const [geoError, setGeoError] = useState('')
  const [onlyWithWater, setOnlyWithWater] = useState(false)
  const [showNonPotable, setShowNonPotable] = useState(false)
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
        <FontMarkers nonce={nonce} onlyWithWater={onlyWithWater} showNonPotable={showNonPotable} />
        <Recenter target={me} />
        <Recenter target={goto} />
        {me && <Marker position={me} />}
        {placing && <PlacePicker onPick={setPos} />}
        {pos && <Marker position={pos} />}
      </MapContainer>

      <SearchBox onSelect={(f) => setGoto([f.latitude, f.longitude])} />

      <div className="map-controls">
        <button className="ctrl" onClick={locateMe}>📍 Cerca de mí</button>
        <button className={'ctrl' + (onlyWithWater ? ' active' : '')} onClick={() => setOnlyWithWater((v) => !v)}>
          💧 Solo con agua
        </button>
        <button className={'ctrl' + (showNonPotable ? ' active' : '')} onClick={() => setShowNonPotable((v) => !v)} title="Modo emergencia: incluye fuentes marcadas como no potables">
          🚱 Incluir no potables
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
