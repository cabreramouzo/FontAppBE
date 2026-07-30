import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link, useSearchParams } from 'react-router-dom'
import L, { type LatLng, type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../leafletSetup'
import type { Drinkable, Font, FontSummary, Page, WaterSource } from '../api/types'
import { apiFetch, createFont, describeError, uploadImage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../components/ToastContext'
import { ClusteredMarkers } from '../components/ClusteredMarkers'
import { ImagePicker } from '../components/ImagePicker'
import { WATER_STATUS, waterStatusInfo } from '../lib/waterStatus'
import { formatDist, haversineKm } from '../lib/geo'
import { searchPlaces, type Place } from '../lib/geocode'
import { compressImage } from '../lib/image'
import { DRINKABLE_OPTIONS, SOURCE_OPTIONS, DRINKABLE_EMOJI, SOURCE_EMOJI, isNotPotable } from '../lib/waterType'
import { timeAgo } from '../lib/time'

// Centro por defecto: comarca del Moianès.
const MOIANES: [number, number] = [41.81, 2.09]

const hasWater = (f: FontSummary) => f.lastWaterStatus === 'flowing' || f.lastWaterStatus === 'trickle'

function FontMarkers({
  nonce,
  onlyWithWater,
  showNonPotable,
  sourceFilter,
  selectedID,
}: {
  nonce: number
  onlyWithWater: boolean
  showNonPotable: boolean
  sourceFilter: WaterSource | 'all'
  selectedID: string | null
}) {
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
  if (sourceFilter !== 'all') shown = shown.filter((f) => f.source === sourceFilter)
  return <ClusteredMarkers fonts={shown} selectedID={selectedID} />
}

// Captura el clic en el mapa para situar la nueva fuente.
function PlacePicker({ onPick }: { onPick: (pos: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng) })
  return null
}

// Enfoca una fuente centrándola en el área visible por ENCIMA del panel inferior
// (bottom-sheet "cerca de ti"), para que el pin no quede tapado por la lista.
function FocusOn({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const zoom = 16
    const latlng = L.latLng(target[0], target[1])
    let offsetY = 0
    const panel = document.querySelector('.nearby') as HTMLElement | null
    if (panel) {
      const mapRect = map.getContainer().getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      // ¿El panel tapa la parte inferior del mapa (bottom-sheet)? Entonces centra
      // el pin en la mitad del hueco visible que queda por encima.
      const coversBottom = panelRect.bottom >= mapRect.bottom - 1 && panelRect.top > mapRect.top
      if (coversBottom) {
        const visibleH = panelRect.top - mapRect.top
        offsetY = map.getSize().y / 2 - visibleH / 2
      }
    }
    if (offsetY > 0) {
      const p = map.project(latlng, zoom)
      const center = map.unproject(L.point(p.x, p.y + offsetY), zoom)
      map.setView(center, zoom)
    } else {
      map.setView(latlng, zoom)
    }
  }, [target, map])
  return null
}

// Encuadra el mapa a un lugar buscado (usa su bounding box si lo hay).
function FlyToPlace({ place }: { place: Place | null }) {
  const map = useMap()
  useEffect(() => {
    if (!place) return
    if (place.bbox) {
      const [s, n, w, e] = place.bbox
      map.fitBounds([[s, w], [n, e]], { maxZoom: 16 })
    } else {
      map.setView([place.lat, place.lon], 14)
    }
  }, [place, map])
  return null
}

function SearchBox({ onSelect, onSelectPlace }: { onSelect: (f: Font) => void; onSelectPlace: (p: Place) => void }) {
  const { t, lang } = useI18n()
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<Font[]>([])
  const [places, setPlaces] = useState<Place[]>([])

  // Búsqueda con debounce: fuentes (nuestra API) y lugares (Nominatim/OSM) en paralelo.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setMatches([])
      setPlaces([])
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      apiFetch<Page<Font>>(`/fonts?search=${encodeURIComponent(term)}&per=6`)
        .then((p) => setMatches(p.items))
        .catch(() => setMatches([]))
      searchPlaces(term, lang, ctrl.signal).then(setPlaces)
    }, 350)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, lang])

  function clear() {
    setQ('')
    setMatches([])
    setPlaces([])
  }

  const hasResults = matches.length > 0 || places.length > 0
  return (
    <div className="search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('map.searchPlaceholder')} />
      {hasResults && (
        <ul className="search-list">
          {matches.length > 0 && <li className="search-group">💧 {t('search.fountains')}</li>}
          {matches.map((f) => (
            <li key={f.id}>
              <button className="search-item" onClick={() => { onSelect(f); clear() }}>{f.name}</button>
            </li>
          ))}
          {places.length > 0 && <li className="search-group">📍 {t('search.places')}</li>}
          {places.map((p, i) => (
            <li key={`p${i}`}>
              <button className="search-item place" onClick={() => { onSelectPlace(p); clear() }}>{p.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewFontForm({ pos, onCancel, onCreated }: { pos: LatLng; onCancel: () => void; onCreated: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState<WaterSource | ''>('')
  const [drinkable, setDrinkable] = useState<Drinkable | ''>('')
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
      await createFont({
        name,
        latitude: pos.lat,
        longitude: pos.lng,
        image,
        description: description || undefined,
        source: source || undefined,
        drinkable: drinkable || undefined,
      })
      toast.show(t('toast.fontCreated'))
      onCreated()
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <h3>{t('newFont.title')}</h3>
      <p className="muted">Lat {pos.lat.toFixed(5)}, Long {pos.lng.toFixed(5)}</p>
      <form onSubmit={submit} className="col">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newFont.name')} required />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('newFont.descriptionOpt')} />
        <label>{t('detail.type')}
          <select value={source} onChange={(e) => setSource(e.target.value as WaterSource | '')}>
            <option value="">{t('detail.unknownType')}</option>
            {SOURCE_OPTIONS.map((k) => (
              <option key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</option>
            ))}
          </select>
        </label>
        <label>{t('detail.drinkability')}
          <select value={drinkable} onChange={(e) => setDrinkable(e.target.value as Drinkable | '')}>
            <option value="">{t('detail.unknownDrink')}</option>
            {DRINKABLE_OPTIONS.map((k) => (
              <option key={k} value={k}>{DRINKABLE_EMOJI[k]} {t(`drink.${k}`)}</option>
            ))}
          </select>
        </label>
        <ImagePicker file={file} onChange={setFile} />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={saving}>{saving ? t('form.saving') : t('form.create')}</button>
          <button type="button" className="link" onClick={onCancel}>{t('form.cancel')}</button>
        </div>
      </form>
    </div>
  )
}

// Lista de fuentes cercanas, ordenadas por distancia, con estado y frescura.
// Tocar una fila la enfoca en el mapa (pin); la flecha → abre el detalle.
function NearbyPanel({
  pos,
  onClose,
  onFocus,
  selectedID,
}: {
  pos: [number, number]
  onClose: () => void
  onFocus: (f: FontSummary) => void
  selectedID: string | null
}) {
  const { t } = useI18n()
  const [items, setItems] = useState<FontSummary[] | null>(null)

  useEffect(() => {
    apiFetch<FontSummary[]>(`/fonts/near?lat=${pos[0]}&long=${pos[1]}&quantity=25`)
      .then(setItems)
      .catch(() => setItems([]))
  }, [pos])

  return (
    <div className="nearby">
      <div className="nearby-head">
        <strong>{t('map.nearbyTitle')}</strong>
        <button className="link" onClick={onClose}>✕</button>
      </div>
      <ul className="nearby-list">
        {items === null && <li className="muted">{t('map.loading')}</li>}
        {items?.map((f) => {
          const ws = waterStatusInfo(f.lastWaterStatus)
          const dist = haversineKm(pos[0], pos[1], f.latitude, f.longitude)
          return (
            <li key={f.id} className={'nearby-row' + (f.id === selectedID ? ' selected' : '')}>
              <button className="nearby-focus" onClick={() => onFocus(f)}>
                <span className="nearby-name">{f.name}</span>
                <span className="nearby-meta muted">
                  {ws && <span title={t(`status.${ws.key}`)}>{ws.emoji}</span>} {formatDist(dist)}
                  {f.lastUpdate && ` · ${timeAgo(f.lastUpdate, t)}`}
                </span>
              </button>
              <Link className="nearby-go" to={`/fonts/${f.id}`} aria-label={t('nearby.goAria', { name: f.name })}>→</Link>
            </li>
          )
        })}
        {items?.length === 0 && <li className="muted">{t('map.nearbyEmpty')}</li>}
      </ul>
    </div>
  )
}

function MapLegend() {
  const { t } = useI18n()
  return (
    <div className="legend">
      {(['flowing', 'trickle', 'dry'] as const).map((k) => (
        <span key={k} className="legend-item">
          <span className="dot" style={{ background: WATER_STATUS[k].color }} /> {t(`status.${k}`)}
        </span>
      ))}
    </div>
  )
}

export function MapPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [placing, setPlacing] = useState(false)
  const [pos, setPos] = useState<LatLng | null>(null)
  const [nonce, setNonce] = useState(0)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [goto, setGoto] = useState<[number, number] | null>(null)
  const [geoError, setGeoError] = useState('')
  const [onlyWithWater, setOnlyWithWater] = useState(false)
  const [showNonPotable, setShowNonPotable] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<WaterSource | 'all'>('all')
  const [showNearby, setShowNearby] = useState(false)
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const [params, setParams] = useSearchParams()

  // Llegada desde el detalle (?lat&lng&sel): centra el mapa en esa fuente y la selecciona.
  useEffect(() => {
    const lat = parseFloat(params.get('lat') ?? '')
    const lng = parseFloat(params.get('lng') ?? '')
    const sel = params.get('sel')
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setGoto([lat, lng])
      if (sel) setSelectedID(sel)
      setParams({}, { replace: true }) // limpia la URL para no re-disparar al navegar
    }
  }, [params, setParams])

  function focusFont(f: FontSummary) {
    setGoto([f.latitude, f.longitude])
    setSelectedID(f.id ?? null)
  }

  function cancel() {
    setPlacing(false)
    setPos(null)
  }
  function created() {
    cancel()
    setNonce((n) => n + 1) // fuerza recarga de marcadores
  }
  // Geolocaliza: centra en mí y (opcionalmente) abre la lista de cercanas.
  function locate(openList: boolean) {
    setGeoError('')
    if (!navigator.geolocation) {
      setGeoError(t('map.geoUnavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c: [number, number] = [p.coords.latitude, p.coords.longitude]
        setMe(c)
        setGoto([...c])
        if (openList) setShowNearby(true)
      },
      () => setGeoError(t('map.geoFailed')),
    )
  }

  return (
    <div className="map-wrap">
      <MapContainer center={MOIANES} zoom={12} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FontMarkers nonce={nonce} onlyWithWater={onlyWithWater} showNonPotable={showNonPotable} sourceFilter={sourceFilter} selectedID={selectedID} />
        <FocusOn target={goto} />
        <FlyToPlace place={place} />
        {me && <Marker position={me} />}
        {placing && <PlacePicker onPick={setPos} />}
        {pos && <Marker position={pos} />}
      </MapContainer>

      <SearchBox onSelect={(f) => { setGoto([f.latitude, f.longitude]); setSelectedID(f.id) }} onSelectPlace={setPlace} />

      <div className="map-controls">
        <button className="ctrl" onClick={() => locate(true)}>{t('map.near')}</button>
        <button className={'ctrl' + (onlyWithWater ? ' active' : '')} onClick={() => setOnlyWithWater((v) => !v)}>
          {t('map.onlyWater')}
        </button>
        <button className={'ctrl' + (showNonPotable ? ' active' : '')} onClick={() => setShowNonPotable((v) => !v)} title={t('map.includeNonPotableTitle')}>
          {t('map.includeNonPotable')}
        </button>
        <select className="ctrl type-filter" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as WaterSource | 'all')} aria-label={t('map.filterType')}>
          <option value="all">{t('map.filterType')}: {t('map.allTypes')}</option>
          {SOURCE_OPTIONS.map((k) => (
            <option key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</option>
          ))}
        </select>
      </div>
      {geoError && <div className="hint hint-error">{geoError}</div>}

      <MapLegend />

      {showNearby && me && (
        <NearbyPanel pos={me} onClose={() => setShowNearby(false)} onFocus={focusFont} selectedID={selectedID} />
      )}

      {!placing && (
        <div className="map-fabs">
          <button className="locate-btn" onClick={() => locate(false)} title={t('map.recenter')} aria-label={t('map.recenter')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2 4.6 20.4c-.26.64.4 1.28 1.03.99L12 18.4l6.37 2.99c.63.29 1.29-.35 1.03-.99L12 2.2z" /></svg>
          </button>
          {user && (
            <button className="fab" onClick={() => { setPlacing(true); setPos(null) }}>
              {t('map.addFont')}
            </button>
          )}
        </div>
      )}
      {placing && !pos && (
        <div className="hint">
          {t('map.tapToPlace')} · <button className="link" onClick={cancel}>{t('map.cancel')}</button>
        </div>
      )}
      {placing && pos && <NewFontForm pos={pos} onCancel={cancel} onCreated={created} />}
    </div>
  )
}
