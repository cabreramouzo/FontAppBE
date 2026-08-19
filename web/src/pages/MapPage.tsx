import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { Link, useSearchParams } from 'react-router-dom'
import Chip from '@mui/material/Chip'
import Fab from '@mui/material/Fab'
import Badge from '@mui/material/Badge'
import Collapse from '@mui/material/Collapse'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import SearchIcon from '@mui/icons-material/Search'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import NearMeIcon from '@mui/icons-material/NearMe'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import DoNotDisturbAltIcon from '@mui/icons-material/DoNotDisturbAlt'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CloseIcon from '@mui/icons-material/Close'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import TuneIcon from '@mui/icons-material/Tune'
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import L, { type LatLng, type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../leafletSetup'
import { MeMarker } from '../components/MeMarker'
import { Compass } from '../components/Compass'
import { useHeading } from '../lib/useHeading'
// Parchea L.Map para poder girar el mapa con dos dedos. Se importa por su efecto.
import 'leaflet-rotate'

import type { Drinkable, Font, FontSummary, Page, WaterSource } from '../api/types'
import { apiFetch, createComment, createFont, describeError, uploadImage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../components/ToastContext'
import { ClusteredMarkers } from '../components/ClusteredMarkers'
import { BaseLayerTile, LayerPicker, useBaseLayer } from '../components/BaseLayers'
import { BottomSheet } from '../components/BottomSheet'
import { MissionsPanel } from '../components/MissionsPanel'
import { WaterTypeHelpButton } from '../components/WaterTypeHelp'
import { enqueue, isOffline } from '../lib/outbox'
import { ImagePicker } from '../components/ImagePicker'
import { NO_STATUS_COLOR, WATER_STATUS, WATER_STATUS_OPTIONS, waterStatusInfo } from '../lib/waterStatus'
import { formatDist, haversineKm } from '../lib/geo'
import { WorthChip } from '../components/WorthChip'
import { searchPlaces, type Place } from '../lib/geocode'
import { prepararFoto } from '../lib/image'
import { readGpsFromImage, type GpsCoords } from '../lib/exif'
import { DRINKABLE_OPTIONS, SOURCE_OPTIONS, DRINKABLE_EMOJI, SOURCE_EMOJI, isNotPotable } from '../lib/waterType'
import { timeAgo } from '../lib/time'

// Centro por defecto: demarcación del Moianès.
const MOIANES: [number, number] = [41.81, 2.09]

// Última vista del mapa (centro + zoom), para restaurarla al volver del detalle.
// En sessionStorage: persiste durante la navegación y recargas de la sesión, y se
// limpia al cerrar la pestaña (una apertura nueva vuelve al centro por defecto).
const VIEW_KEY = 'fontapp_map_view'
type SavedView = { lat: number; lng: number; zoom: number }
function loadView(): SavedView | null {
  try {
    const s = sessionStorage.getItem(VIEW_KEY)
    return s ? (JSON.parse(s) as SavedView) : null
  } catch {
    return null
  }
}
function saveView(v: SavedView) {
  try {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(v))
  } catch {
    /* almacenamiento no disponible: no pasa nada, solo no recordaremos la vista */
  }
}

// Los filtros del panel, con la misma vida que la vista.
//
// Se guardaban el centro y el zoom pero no los filtros, así que entrar en una fuente y
// volver te devolvía al mismo sitio con el mapa **repoblado de fuentes que acababas de
// esconder**. Y es justo la combinación normal: filtras, miras una, vuelves a por la
// siguiente. Peor todavía con las herramientas plegadas, porque los chips no se ven y
// parece que el mapa haya cambiado solo.
//
// En `sessionStorage` y no en `localStorage` a propósito, igual que la vista: un filtro
// es de este paseo. Volver mañana y no encontrar las fuentes donde estaban, sin recordar
// que un día marcaste una casilla, es un fallo peor que el que se arregla.
const FILTERS_KEY = 'fontapp_map_filters'
type SavedFilters = { onlyWithWater: boolean; showNonPotable: boolean; source: WaterSource | 'all' }
const SIN_FILTROS: SavedFilters = { onlyWithWater: false, showNonPotable: false, source: 'all' }
const SOURCES: readonly string[] = ['all', 'tap', 'mountain', 'spring', 'well', 'fountain', 'other']

function loadFilters(): SavedFilters {
  try {
    const s = sessionStorage.getItem(FILTERS_KEY)
    if (!s) return SIN_FILTROS
    const v = JSON.parse(s) as Partial<SavedFilters>
    // Se valida en vez de confiar: `source` acaba en un `<TextField select>` y un valor
    // que no esté entre las opciones deja el desplegable en blanco y filtrando por algo
    // que no se puede ni leer ni quitar.
    return {
      onlyWithWater: v.onlyWithWater === true,
      showNonPotable: v.showNonPotable === true,
      source: SOURCES.includes(v.source as string) ? (v.source as WaterSource | 'all') : 'all',
    }
  } catch {
    return SIN_FILTROS
  }
}

function saveFilters(f: SavedFilters) {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(f))
  } catch {
    /* almacenamiento no disponible: se pierden al navegar, como antes */
  }
}

// Guarda la vista del mapa cada vez que el usuario lo mueve o hace zoom.
function PersistView() {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter()
      saveView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
    },
  })
  return null
}

// Avisa cuando el usuario toma el control del mapa (arrastrar, rueda, pellizco).
// Solo esos tres: `movestart` también lo dispara el centrado automático, y usarlo
// haría que el mapa se "desenganchara" él solo al primer centrado.
function DetectaGestoDelUsuario({ onGesto }: { onGesto: () => void }) {
  useMapEvents({
    dragstart: onGesto,      // arrastrar con el dedo o el ratón
    zoomstart: (e) => {
      // Cubre también la rueda y el pellizco, que acaban en un zoom. El zoom
      // programático de FocusOn pasa por aquí igual, pero sin `originalEvent`:
      // así distinguimos "lo ha hecho el usuario" de "lo hemos hecho nosotros".
      if ((e as unknown as { originalEvent?: Event }).originalEvent) onGesto()
    },
  })
  return null
}

// Mantiene al día el giro del mapa (grados). Lo necesitan la brújula, para orientar la
// aguja, y el cono del usuario, para descontar el giro y seguir apuntando al norte real.
function VigilaGiro({ onChange }: { onChange: (deg: number) => void }) {
  const map = useMapEvents({
    rotate: () => onChange(map.getBearing()),
  })
  return null
}

// Los labels i18n empiezan por emoji ("📍 A prop meu"); en MUI usamos iconos Material,
// así que quitamos el emoji inicial del texto.
const noEmoji = (s: string) => s.replace(/^[^\p{L}\d]+/u, '')

// Estilo Material para los chips de control (superficie elevada; acento si activo).
const chipSx = (active: boolean) => ({
  height: 40,
  borderRadius: '20px',
  px: 0.75,
  fontSize: 14,
  fontWeight: 600,
  bgcolor: active ? 'primary.main' : 'background.paper',
  color: active ? 'primary.contrastText' : 'text.primary',
  borderColor: 'divider',
  boxShadow: 3,
  '& .MuiChip-icon': { color: 'inherit' },
  // `&&` sube la especificidad para ganar al hover translúcido por defecto del Chip;
  // fondo OPACO (gris sólido) al pasar por encima, para que se lea bien sobre el mapa.
  '&&:hover': {
    boxShadow: 6,
    backgroundColor: (theme: Theme) =>
      active
        ? theme.palette.primary.dark
        : theme.palette.mode === 'dark'
          ? theme.palette.grey[800]
          : theme.palette.grey[200],
  },
})

const hasWater = (f: FontSummary) => f.lastWaterStatus === 'flowing' || f.lastWaterStatus === 'trickle'

// Lo que `ClusteredMarkers` pinta de cada fuente, en una cadena comparable. Solo estos
// campos: si mañana el popup enseña uno más, hay que añadirlo aquí o el mapa se quedaría
// con el dato viejo hasta el siguiente cambio de verdad.
function firmaDeFuentes(l: FontSummary[]): string {
  return l
    .map((f) => [f.id, f.latitude, f.longitude, f.name, f.source, f.drinkable, f.lastWaterStatus, f.lastUpdate].join('|'))
    .join('~')
}

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
      const nuevas = await apiFetch<FontSummary[]>(`/fonts/in-bounds?${params}`)
      // Se conserva el array anterior si lo que se pinta no ha cambiado. Cambiar su
      // identidad reconstruye TODOS los marcadores, que es caro y además se lleva por
      // delante el popup abierto — y recentrar el mapa estando parado devuelve
      // exactamente las mismas fuentes.
      setFonts((prev) => (firmaDeFuentes(prev) === firmaDeFuentes(nuevas) ? prev : nuevas))
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

  // Memorizado a propósito, no por rendimiento: `.filter()` suelto devolvía un array
  // nuevo en CADA render, y este componente repinta con cada posición del GPS (cada
  // pocos segundos mientras caminas). Como `ClusteredMarkers` reconstruye los
  // marcadores cuando cambia la identidad del array, el popup que acababas de abrir se
  // destruía solo al segundo siguiente, sin que hubiera cambiado ni un dato.
  const shown = useMemo(() => {
    let l = showNonPotable ? fonts : fonts.filter((f) => !isNotPotable(f.drinkable))
    if (onlyWithWater) l = l.filter(hasWater)
    if (sourceFilter !== 'all') l = l.filter((f) => f.source === sourceFilter)
    return l
  }, [fonts, showNonPotable, onlyWithWater, sourceFilter])
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

// Control de zoom Material (sustituye al +/- por defecto de Leaflet).
function ZoomControls() {
  const map = useMap()
  return (
    <Paper className="zoom-ctrl" elevation={3} sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column', borderRadius: 3, overflow: 'hidden' }}>
      <IconButton size="small" onClick={() => map.zoomIn()} aria-label="zoom in"><AddIcon fontSize="small" /></IconButton>
      <Divider />
      <IconButton size="small" onClick={() => map.zoomOut()} aria-label="zoom out"><RemoveIcon fontSize="small" /></IconButton>
    </Paper>
  )
}

function SearchBox({ onSelect, onSelectPlace, me }: { onSelect: (f: Font) => void; onSelectPlace: (p: Place) => void; me: [number, number] | null }) {
  const { t, lang } = useI18n()
  const theme = useTheme()
  // En móvil el buscador ocupaba la franja superior entera: era, con diferencia, lo que
  // más mapa tapaba, para algo que se usa un momento al principio y luego casi nunca.
  // Plegado a una lupa, esa banda vuelve a ser mapa.
  const compacto = useMediaQuery(theme.breakpoints.down('sm'))
  const [abierto, setAbierto] = useState(!compacto)
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<Font[]>([])
  const [places, setPlaces] = useState<Place[]>([])

  // Al girar el móvil o cambiar de tamaño, el buscador vuelve a su forma natural.
  useEffect(() => setAbierto(!compacto), [compacto])

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

  function abrir() {
    setAbierto(true)
    // El foco va tras el render, o el teclado no sube en iOS.
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function cerrar() {
    clear()
    setAbierto(false)
  }

  const hasResults = matches.length > 0 || places.length > 0

  // De qué fuente estamos hablando. Sin esto, buscar «font» devolvía **seis filas
  // seguidas llamadas «A Fonte»** sin nada que las distinga: en un desplegable pequeño se
  // disimulaba, ocupando la pantalla entera es que no se puede elegir.
  //
  // No hay columna de municipio —`fonts.region` son provincias, distritos o départements,
  // ver «Comarca ≠ provincia»— así que se dice la **demarcación**, que es lo que de verdad
  // hay. Y delante la **distancia**, que es lo que responde a «¿a cuál voy?», solo si se
  // sabe dónde estás. Lo que falte simplemente no sale; nada se inventa.
  const donde = (f: Font) => [
    me ? formatDist(haversineKm(me[0], me[1], f.latitude, f.longitude)) : null,
    f.region,
  ].filter(Boolean).join(' · ')

  // Los resultados, una sola vez. Cambia el tamaño de la fila —48 px para el pulgar en la
  // pantalla completa, compacto con ratón— pero no qué se enseña ni en qué orden.
  const resultados = (aPantallaCompleta: boolean) => (
    <List dense={!aPantallaCompleta} disablePadding>
      {matches.length > 0 && <ListSubheader>💧 {t('search.fountains')}</ListSubheader>}
      {matches.map((f) => (
        <ListItemButton
          key={f.id}
          onClick={() => { onSelect(f); compacto ? cerrar() : clear() }}
          sx={aPantallaCompleta ? { minHeight: 56 } : undefined}
        >
          <ListItemText primary={f.name} secondary={donde(f) || undefined} />
        </ListItemButton>
      ))}
      {places.length > 0 && <ListSubheader>📍 {t('search.places')}</ListSubheader>}
      {places.map((p, i) => (
        <ListItemButton
          key={`p${i}`}
          onClick={() => { onSelectPlace(p); compacto ? cerrar() : clear() }}
          sx={aPantallaCompleta ? { minHeight: 56 } : undefined}
        >
          <ListItemText primary={p.name} sx={aPantallaCompleta ? undefined : { '& .MuiListItemText-primary': { fontSize: 13 } }} />
        </ListItemButton>
      ))}
    </List>
  )

  // En móvil, buscar es una pantalla, no un campo flotante. Es lo que hace Maps y lo que
  // espera cualquiera: al teclear sube el teclado, que se come media pantalla, y una lista
  // de resultados metida en una tarjeta sobre el mapa se queda en dos filas visibles.
  // A pantalla completa el teclado tapa lo que sobra y no lo que importa.
  if (compacto && abierto) {
    return (
      <Dialog
        fullScreen
        open
        onClose={cerrar}
        // El foco tras la transición: puesto antes, iOS no sube el teclado.
        slotProps={{ transition: { onEntered: () => inputRef.current?.focus() } }}
      >
        <Paper
          elevation={0}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5,
            pt: 'env(safe-area-inset-top)',
            borderBottom: 1, borderColor: 'divider', borderRadius: 0,
          }}
        >
          <IconButton onClick={cerrar} aria-label={t('form.cancel')} size="large">
            <ArrowBackIcon />
          </IconButton>
          <InputBase
            inputRef={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('map.searchPlaceholder').replace(/^[^\p{L}]+/u, '')}
            fullWidth
            inputProps={{ maxLength: 80 }}
            // 16 px o más, o iOS hace zoom al enfocar el campo y deja el mapa torcido.
            sx={{ py: 1.5, fontSize: 16 }}
          />
          {q && (
            <IconButton onClick={clear} aria-label={t('form.cancel')} size="small">
              <CloseIcon />
            </IconButton>
          )}
        </Paper>
        <Box sx={{ flex: 1, overflowY: 'auto', pb: 'env(safe-area-inset-bottom)' }}>
          {hasResults
            ? resultados(true)
            : (
              // Ni resultados ni ruido: solo se dice qué se puede buscar. Sin esto la
              // pantalla queda en blanco y parece que se ha roto algo.
              <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                {t('search.hint')}
              </Typography>
            )}
        </Box>
      </Dialog>
    )
  }

  if (!abierto) {
    return (
      <Box className="search search--collapsed">
        <Paper
          component="button"
          onClick={abrir}
          elevation={3}
          aria-label={t('map.searchPlaceholder').replace(/^[^\p{L}]+/u, '')}
          sx={{
            width: 48,
            height: 48,
            p: 0,
            border: 0,
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <SearchIcon sx={{ color: 'text.secondary' }} />
        </Paper>
      </Box>
    )
  }

  return (
    <Box className="search">
      <Paper elevation={3} sx={{ display: 'flex', alignItems: 'center', px: 1.5, borderRadius: '24px' }}>
        <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
        <InputBase
          inputRef={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('map.searchPlaceholder').replace(/^[^\p{L}]+/u, '')}
          fullWidth
          // Ningún topónimo se acerca a 80. El servidor también lo acota (ver
          // `SearchTerm`); esto es solo para no mandar de balde lo que se va a recortar.
          inputProps={{ maxLength: 80 }}
          sx={{ py: 1, fontSize: 16 }}
        />
        {compacto && (
          <IconButton size="small" onClick={cerrar} aria-label={t('form.cancel')}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Paper>
      {hasResults && (
        <Paper elevation={4} sx={{ mt: 0.5, borderRadius: 3, overflow: 'hidden', maxHeight: '50vh', overflowY: 'auto' }}>
          {resultados(false)}
        </Paper>
      )}
    </Box>
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
  // Estado del agua: se puede dejar ya al crear la fuente (quien la añade suele estar
  // delante de ella). Se publica como primera actualización, sin abrir el detalle.
  const [waterStatus, setWaterStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Ubicación efectiva: el clic del usuario, que la foto puede sugerir cambiar.
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: pos.lat, lng: pos.lng })
  const [gpsHint, setGpsHint] = useState<GpsCoords | null>(null)

  // El pin se puede seguir moviendo tocando el mapa con el formulario abierto:
  // hay que reflejarlo aquí o crearíamos la fuente en el punto inicial.
  useEffect(() => {
    setCoords({ lat: pos.lat, lng: pos.lng })
  }, [pos])

  // Al elegir foto: si su EXIF lleva GPS y difiere > ~15 m del punto actual,
  // ofrecemos usar esas coordenadas (leídas del File ORIGINAL, antes de comprimir).
  async function pickFile(f: File | null) {
    setFile(f)
    setGpsHint(null)
    if (!f) return
    const gps = await readGpsFromImage(f)
    if (gps && haversineKm(coords.lat, coords.lng, gps.lat, gps.lon) > 0.015) {
      setGpsHint(gps)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    // Comprimimos antes de nada: así la foto ya está lista tanto para subirla ahora
    // como para guardarla en la cola si resulta que no hay cobertura.
    const preparada = file ? await prepararFoto(file) : undefined
    const photo = preparada?.photo
    const data = {
      name,
      latitude: coords.lat,
      longitude: coords.lng,
      description: description || undefined,
      source: source || undefined,
      drinkable: drinkable || undefined,
    }
    try {
      const image = photo ? await uploadImage(photo, preparada?.meta) : undefined
      const font = await createFont({ ...data, image })
      // El estado va como primera actualización de la fuente. Best-effort: si fallara,
      // la fuente ya está creada y no tiene sentido abortar (se puede añadir luego).
      if (waterStatus) {
        try {
          await createComment(font.id, { waterStatus })
        } catch {
          /* la fuente se ha creado igualmente */
        }
      }
      toast.show(t('toast.fontCreated'))
      onCreated()
    } catch (e) {
      // Sin cobertura: no perdemos la fuente. Se guarda en el móvil y se envía sola.
      if (isOffline(e)) {
        await enqueue({ kind: 'font', data, waterStatus: waterStatus || undefined, photo, photoName: photo?.name, photoMeta: preparada?.meta })
        toast.show(t('offline.savedFont'))
        onCreated()
      } else {
        setError(describeError(e, t))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <Typography variant="h6">{t('newFont.title')}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Lat {coords.lat.toFixed(5)}, Long {coords.lng.toFixed(5)}
      </Typography>
      <Typography variant="caption" color="text.secondary">{t('newFont.tapToMove')}</Typography>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        <TextField label={t('newFont.name')} value={name} onChange={(e) => setName(e.target.value)} required size="small" />
        {/* El estado del agua, aquí mismo: es el dato más útil y quien añade la fuente
            está delante de ella. Evita crear → volver al mapa → abrir el detalle. */}
        <TextField select label={t('update.status')} value={waterStatus} onChange={(e) => setWaterStatus(e.target.value)} size="small">
          <MenuItem value="">—</MenuItem>
          {WATER_STATUS_OPTIONS.map((k) => (
            <MenuItem key={k} value={k}>{WATER_STATUS[k].emoji} {t(`status.${k}`)}</MenuItem>
          ))}
        </TextField>
        {/* Igual que en la ficha, pero con el techo más bajo: este formulario flota sobre
            el mapa y lo que crezca aquí empuja hacia arriba. */}
        <TextField
          label={t('newFont.descriptionOpt')} value={description}
          onChange={(e) => setDescription(e.target.value)}
          size="small" multiline minRows={2} maxRows={4}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TextField select label={t('detail.type')} value={source} onChange={(e) => setSource(e.target.value as WaterSource | '')} size="small" sx={{ flexGrow: 1 }}>
            <MenuItem value="">{t('detail.unknownType')}</MenuItem>
            {SOURCE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</MenuItem>))}
          </TextField>
          <WaterTypeHelpButton />
        </Box>
        <TextField select label={t('detail.drinkability')} value={drinkable} onChange={(e) => setDrinkable(e.target.value as Drinkable | '')} size="small">
          <MenuItem value="">{t('detail.unknownDrink')}</MenuItem>
          {DRINKABLE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{DRINKABLE_EMOJI[k]} {t(`drink.${k}`)}</MenuItem>))}
        </TextField>
        <ImagePicker file={file} onChange={pickFile} />
        {gpsHint && (
          <Alert
            severity="info"
            icon={<PhotoCameraIcon fontSize="inherit" />}
            action={
              <Button color="inherit" size="small" onClick={() => { setCoords({ lat: gpsHint.lat, lng: gpsHint.lon }); setGpsHint(null) }}>
                {t('newFont.usePhotoGps')}
              </Button>
            }
          >
            {t('newFont.photoHasGps')}
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" disableElevation disabled={saving}>{saving ? t('form.saving') : t('form.create')}</Button>
          <Button onClick={onCancel}>{t('form.cancel')}</Button>
        </Stack>
      </Box>
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
  const movil = useMediaQuery((tema: Theme) => tema.breakpoints.down('sm'))
  const [items, setItems] = useState<FontSummary[] | null>(null)
  const posRef = useRef(pos)
  posRef.current = pos

  // Con la ubicación en seguimiento continuo, `pos` cambia cada pocos segundos. Si la
  // lista se recargara con cada cambio sería una petición por latido del GPS, así que
  // solo la refrescamos al cambiar de "casilla" de ~100 m (3 decimales de grado).
  const casilla = `${pos[0].toFixed(3)},${pos[1].toFixed(3)}`
  useEffect(() => {
    const [lat, long] = posRef.current
    apiFetch<FontSummary[]>(`/fonts/near?lat=${lat}&long=${long}&quantity=25`)
      .then(setItems)
      .catch(() => setItems([]))
  }, [casilla])

  const lista = (enHoja: boolean) => (
    <List dense={!enHoja} sx={{ overflowY: 'auto', py: 0 }}>
        {items === null && <ListItem><Typography color="text.secondary">{t('map.loading')}</Typography></ListItem>}
        {items?.map((f) => {
          const ws = waterStatusInfo(f.lastWaterStatus)
          const dist = haversineKm(pos[0], pos[1], f.latitude, f.longitude)
          return (
            <ListItem
              key={f.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" component={Link} to={`/fonts/${f.id}`} aria-label={t('nearby.goAria', { name: f.name })}>
                  <ArrowForwardIcon />
                </IconButton>
              }
            >
              <ListItemButton selected={f.id === selectedID} onClick={() => onFocus(f)} sx={enHoja ? { minHeight: 56 } : undefined}>
                <ListItemText
                  primary={f.name}
                  secondary={
                    <>
                      {ws && <span title={t(`status.${ws.key}`)}>{ws.emoji}</span>} {formatDist(dist)}
                      {f.lastUpdate && ` · ${timeAgo(f.lastUpdate, t)}`}
                      {/* Lo que paga comprobarla, aquí y no en la ficha: el incentivo
                          solo sirve si se ve ANTES de decidir a cuál se va. */}
                      {' '}<WorthChip lastCheck={f.lastUpdate} />
                    </>
                  }
                />
              </ListItemButton>
            </ListItem>
          )
        })}
        {items?.length === 0 && <ListItem><Typography color="text.secondary">{t('map.nearbyEmpty')}</Typography></ListItem>}
    </List>
  )

  // En móvil, hoja desde abajo. Era una tarjeta lateral de 270 px que se quedaba a medias:
  // ni deja ver el mapa —lo tapa por la derecha— ni se lee cómoda, y la fila era un
  // objetivo de escritorio con una flecha diminuta al final. En la hoja va a lo ancho, con
  // filas de 56 px, y se cierra tocando fuera como cualquier otra.
  if (movil) {
    return (
      <BottomSheet open onClose={onClose} titulo={t('map.nearbyTitle')}>
        {lista(true)}
      </BottomSheet>
    )
  }

  return (
    <Paper className="nearby" elevation={6} sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 700 }}>{t('map.nearbyTitle')}</Typography>
        <IconButton size="small" onClick={onClose} aria-label="close"><CloseIcon fontSize="small" /></IconButton>
      </Box>
      {lista(false)}
    </Paper>
  )
}

// Preferencia de la leyenda. Se recuerda: quien ya sabe qué significa cada color no
// quiere volver a cerrarla en cada visita, y quien la necesita la quiere abierta.
const LEGEND_KEY = 'fontapp_legend_open'
function legendOpen(): boolean {
  try {
    // Abierta la primera vez: enseña a leer el mapa, y sin ella los colores no
    // significan nada para quien acaba de llegar.
    return localStorage.getItem(LEGEND_KEY) !== '0'
  } catch {
    return true
  }
}

const LEYENDA = ['flowing', 'trickle', 'dry'] as const

function MapLegend() {
  const { t } = useI18n()
  const [abierta, setAbierta] = useState(legendOpen)

  function alternar() {
    const v = !abierta
    setAbierta(v)
    try {
      localStorage.setItem(LEGEND_KEY, v ? '1' : '0')
    } catch {
      /* sin almacenamiento: se abrirá por defecto en la próxima visita */
    }
  }

  return (
    <Box className="legend" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.75 }}>
      <Collapse in={abierta} unmountOnExit>
        <Paper elevation={3} sx={{ borderRadius: 2, p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {LEYENDA.map((k) => (
            <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13 }}>
              <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: WATER_STATUS[k].color }} /> {t(`status.${k}`)}
            </Box>
          ))}
          {/* El azul es el color de la MAYORÍA del mapa: las fuentes que nadie ha
              reseñado todavía, casi todas las importadas. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13 }}>
            <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: NO_STATUS_COLOR }} /> {t('status.unknown')}
          </Box>
        </Paper>
      </Collapse>

      {/* Mismo `Fab` que los demás botones del mapa, y el mismo gesto que el de
          herramientas: el icono pasa a una X cuando está abierto. Antes era un botón a
          medida con cuatro puntos de color dentro y desentonaba con todo lo demás. */}
      <Fab
        size="small"
        onClick={alternar}
        aria-expanded={abierta}
        aria-label={t(abierta ? 'legend.hide' : 'legend.show')}
        title={t(abierta ? 'legend.hide' : 'legend.show')}
        sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
      >
        {abierta ? <CloseIcon fontSize="small" /> : <PaletteOutlinedIcon fontSize="small" />}
      </Fab>
    </Box>
  )
}

export function MapPage() {
  const { user, promptLocation, dismissLocationPrompt } = useAuth()
  const { t } = useI18n()
  const [placing, setPlacing] = useState(false)
  const [pos, setPos] = useState<LatLng | null>(null)
  const [nonce, setNonce] = useState(0)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [goto, setGoto] = useState<[number, number] | null>(null)
  const [geoError, setGeoError] = useState('')
  // Los tres arrancan de lo último elegido en esta sesión, igual que la vista del mapa.
  // `down('sm')` y no un ancho a mano: es el mismo corte que usan la tab bar, el pie y
  // los controles de la cabecera, así que la app entera cambia de forma a la vez.
  const movil = useMediaQuery((tema: Theme) => tema.breakpoints.down('sm'))
  const [filtrosGuardados] = useState(loadFilters)
  const [onlyWithWater, setOnlyWithWater] = useState(filtrosGuardados.onlyWithWater)
  const [showNonPotable, setShowNonPotable] = useState(filtrosGuardados.showNonPotable)
  const [sourceFilter, setSourceFilter] = useState<WaterSource | 'all'>(filtrosGuardados.source)
  const [controlsOpen, setControlsOpen] = useState(false)
  const { layer, setLayer } = useBaseLayer()
  // Instancia del mapa: hace falta fuera del lienzo para el botón de la brújula.
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [bearing, setBearing] = useState(0)
  const { heading, enable: enableCompass } = useHeading()
  // Nº de filtros activos (para el aviso cuando las herramientas están plegadas).
  const activeFilters = (onlyWithWater ? 1 : 0) + (showNonPotable ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0)

  // Al cambiar cualquiera, se recuerda. Es lo que hace que volver del detalle no
  // repueble el mapa con lo que acababas de esconder.
  useEffect(() => {
    saveFilters({ onlyWithWater, showNonPotable, source: sourceFilter })
  }, [onlyWithWater, showNonPotable, sourceFilter])
  const [showNearby, setShowNearby] = useState(false)
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [missionsOpen, setMissionsOpen] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  const [params, setParams] = useSearchParams()
  // Vista inicial: la última guardada (al volver del detalle) o el Moianès por defecto.
  const [initialView] = useState(loadView)

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

  // Añadir fuente: si ya sabemos dónde está el usuario, ponemos el pin ahí y abrimos
  // el formulario directamente (lo normal es estar delante de la fuente). Si no, se
  // pide la ubicación y mientras tanto se puede tocar el mapa para situarla.
  function startPlacing() {
    setPlacing(true)
    setPos(null)
    if (me) {
      setPos(L.latLng(me[0], me[1]))
      setGoto([me[0], me[1]])
    } else {
      locate(false)
    }
  }

  // La ubicación puede llegar después de abrir el formulario: si el usuario aún no ha
  // tocado el mapa, situamos el pin donde está.
  useEffect(() => {
    if (placing && !pos && me) setPos(L.latLng(me[0], me[1]))
  }, [placing, pos, me])

  function cancel() {
    setPlacing(false)
    setPos(null)
  }
  function created() {
    cancel()
    setNonce((n) => n + 1) // fuerza recarga de marcadores
  }
  // Seguimiento continuo: mientras caminas hacia una fuente, el punto azul te sigue
  // solo. Antes había que ir pulsando el botón de ubicarse, que es justo lo que no
  // quieres estar haciendo con el móvil en la mano y una cuesta por delante.
  const watchID = useRef<number | null>(null)
  const seguimiento = useRef(false)
  // Última posición aceptada (la que pasó el filtro de temblor del GPS).
  const ultimaPos = useRef<[number, number] | null>(null)
  // ¿El mapa va detrás de ti? Deja de hacerlo en cuanto tocas el mapa: a partir de
  // ahí estás mirando otra zona y que el mapa te devuelva a tu posición cada pocos
  // segundos sería insufrible. El botón de "centrar en mí" lo vuelve a activar.
  const [siguiendo, setSiguiendo] = useState(true)
  const siguiendoRef = useRef(true)
  siguiendoRef.current = siguiendo

  const startWatching = useCallback(() => {
    if (watchID.current !== null || !navigator.geolocation) return
    seguimiento.current = true
    watchID.current = navigator.geolocation.watchPosition(
      (p) => {
        const c: [number, number] = [p.coords.latitude, p.coords.longitude]
        // El GPS "baila" unos metros estando quieto. Sin este filtro el punto
        // temblaría y la lista de cercanas se recargaría sin haberte movido.
        const anterior = ultimaPos.current
        if (anterior && haversineKm(anterior[0], anterior[1], c[0], c[1]) * 1000 < 15) return
        ultimaPos.current = c
        setMe(c)
        // Mientras no toques el mapa, va detrás de ti. La comparación se hace contra
        // una ref y no dentro del actualizador de `setMe`: encadenar un `setGoto` ahí
        // es una actualización en fase de render y React la descarta sin avisar.
        if (siguiendoRef.current) setGoto([...c])
      },
      // Un fallo puntual del GPS no es noticia: seguimos con la última posición buena.
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }, [])

  // El efecto de arranque necesita llamar a `locate`, que se define más abajo y cambia
  // en cada render; con la referencia el efecto puede depender solo de lo estable.
  const locateRef = useRef<(openList: boolean) => void>(() => {})

  const stopWatching = useCallback(() => {
    if (watchID.current !== null) {
      navigator.geolocation.clearWatch(watchID.current)
      watchID.current = null
    }
  }, [])

  useEffect(() => {
    // Al abrir la app te situamos solo, sin esperar a que pulses el botón. Dos avisos:
    //  · solo si el permiso YA está concedido, para no lanzar el diálogo del navegador
    //    a bocajarro a quien acaba de llegar;
    //  · y solo si no venimos de una vista guardada o de un enlace a una fuente
    //    concreta — ahí el usuario ya dijo dónde quiere mirar.
    // Se lee de `window.location` y no de `params` para que este efecto corra una
    // sola vez al montar: `params` cambia de identidad y lo relanzaría.
    const veniaDeOtroSitio = loadView() !== null
      || new URLSearchParams(window.location.search).get('lat') !== null
    if (veniaDeOtroSitio) setSiguiendo(false)
    navigator.permissions?.query({ name: 'geolocation' })
      .then((estado) => {
        if (estado.state !== 'granted') return
        startWatching()
        if (!veniaDeOtroSitio) locateRef.current(false)
      })
      .catch(() => {})

    // Con la app en segundo plano el GPS solo gasta batería.
    const alCambiarVisibilidad = () => {
      if (document.hidden) stopWatching()
      else if (seguimiento.current) startWatching()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      stopWatching()
    }
  }, [startWatching, stopWatching])

  // Geolocaliza: centra en mí y (opcionalmente) abre la lista de cercanas.
  function locate(openList: boolean) {
    setGeoError('')
    if (!navigator.geolocation) {
      setGeoError(t('map.geoUnavailable'))
      return
    }
    // La geolocalización solo funciona en contexto seguro (HTTPS o localhost).
    if (!window.isSecureContext) {
      setGeoError(t('map.geoInsecure'))
      return
    }
    setSiguiendo(true)   // pulsar "centrar en mí" vuelve a enganchar el mapa
    const onOk = (p: GeolocationPosition) => {
      const c: [number, number] = [p.coords.latitude, p.coords.longitude]
      setMe(c)
      setGoto([...c])   // centrar el mapa solo aquí: el seguimiento NO lo mueve
      if (openList) setShowNearby(true)
      startWatching()   // ya hay permiso: a partir de ahora se actualiza sola
    }

    // 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
    navigator.geolocation.getCurrentPosition(
      onOk,
      (err) => {
        // Permiso denegado: es decisión del usuario, no reintentamos.
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(t('map.geoDenied'))
          return
        }
        // POSITION_UNAVAILABLE / TIMEOUT: en escritorio la alta precisión (GPS)
        // suele fallar o tardar. Reintentamos con precisión de RED, más fiable,
        // con más tiempo y aceptando una posición cacheada reciente.
        navigator.geolocation.getCurrentPosition(
          onOk,
          (err2) => {
            setGeoError(t('map.geoFailed'))
            console.warn('geolocation error', err2.code, err2.message)
          },
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 },
        )
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }
  locateRef.current = locate

  // Los mismos controles en las dos formas. En una función y no copiados: dos listas de
  // filtros se separan al primer añadido, y el que se olvide solo se nota en uno de los
  // dos tamaños de pantalla. Lo único que cambia es la caja que los envuelve.
  //
  // En la hoja van a lo ancho y con 48 px de alto —el mínimo cómodo para un pulgar—; como
  // chips flotantes se quedan con su tamaño de siempre, que con ratón se acierta.
  const filtros = (donde: 'escritorio' | 'movil') => {
    const enHoja = donde === 'movil'
    const sxChip = (activo: boolean) => (enHoja
      ? { width: '100%', height: 48, borderRadius: 3, justifyContent: 'flex-start', fontSize: 15, '& .MuiChip-label': { flexGrow: 1, textAlign: 'left' } }
      : chipSx(activo))
    return (
      <>
        <Chip clickable variant="outlined" icon={<MyLocationIcon />} label={noEmoji(t('map.near'))}
              onClick={() => { locate(true); if (enHoja) setControlsOpen(false) }} sx={sxChip(false)} />
        <Chip
          clickable
          variant={onlyWithWater ? 'filled' : 'outlined'}
          color={enHoja && onlyWithWater ? 'primary' : undefined}
          icon={<WaterDropIcon />}
          label={noEmoji(t('map.onlyWater'))}
          onClick={() => setOnlyWithWater((v) => !v)}
          sx={sxChip(onlyWithWater)}
        />
        <Chip
          clickable
          variant={showNonPotable ? 'filled' : 'outlined'}
          color={enHoja && showNonPotable ? 'primary' : undefined}
          icon={<DoNotDisturbAltIcon />}
          label={noEmoji(t('map.includeNonPotable'))}
          onClick={() => setShowNonPotable((v) => !v)}
          title={t('map.includeNonPotableTitle')}
          sx={sxChip(showNonPotable)}
        />
        <Select
          size="small"
          fullWidth={enHoja}
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as WaterSource | 'all')}
          aria-label={t('map.filterType')}
          renderValue={(v) => (v === 'all' ? `${t('map.filterType')}: ${t('map.allTypes')}` : `${SOURCE_EMOJI[v as WaterSource]} ${t(`source.${v}`)}`)}
          sx={enHoja
            ? { height: 48, borderRadius: 3, fontSize: 15 }
            : {
                height: 40,
                borderRadius: '20px',
                bgcolor: 'background.paper',
                color: 'text.primary',
                fontSize: 14,
                fontWeight: 600,
                boxShadow: 3,
                '& .MuiOutlinedInput-notchedOutline': { border: 0 },
              }}
        >
          <MenuItem value="all">{t('map.allTypes')}</MenuItem>
          {SOURCE_OPTIONS.map((k) => (
            <MenuItem key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</MenuItem>
          ))}
        </Select>
      </>
    )
  }

  return (
    <div className="map-wrap">
      {/* Priming de ubicación tras la bienvenida: explica por qué la pedimos
          antes de disparar el permiso nativo del navegador. */}
      <Dialog open={promptLocation} onClose={dismissLocationPrompt} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', pt: 3 }}>
          <MyLocationIcon color="primary" sx={{ fontSize: 48 }} />
          <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>{t('geoPrompt.title')}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>{t('geoPrompt.body')}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, flexDirection: 'column', gap: 1 }}>
          <Button
            variant="contained"
            disableElevation
            fullWidth
            startIcon={<MyLocationIcon />}
            onClick={() => { dismissLocationPrompt(); locate(true) }}
          >
            {t('geoPrompt.allow')}
          </Button>
          <Button fullWidth onClick={dismissLocationPrompt}>{t('geoPrompt.later')}</Button>
        </DialogActions>
      </Dialog>

      <MapContainer
        ref={setMap}
        center={initialView ? [initialView.lat, initialView.lng] : MOIANES}
        zoom={initialView?.zoom ?? 12}
        className="map"
        scrollWheelZoom
        zoomControl={false}
        // Girar el mapa con dos dedos, como en cualquier app de navegación: al seguir
        // un camino se quiere el camino hacia arriba, no el norte.
        rotate
        touchRotate
        // Sin esto las teselas se quedan a medio aparecer: leaflet-rotate rompe el
        // bucle de opacidad del fundido de Leaflet 1.9 y nunca llega a 1. Apagarlo
        // no se nota — las teselas salen de golpe, ya cargadas.
        fadeAnimation={false}
      >
        <BaseLayerTile layer={layer} />
        <FontMarkers nonce={nonce} onlyWithWater={onlyWithWater} showNonPotable={showNonPotable} sourceFilter={sourceFilter} selectedID={selectedID} />
        <PersistView />
        <FocusOn target={goto} />
        <DetectaGestoDelUsuario onGesto={() => setSiguiendo(false)} />
        <FlyToPlace place={place} />
        <ZoomControls />
        <VigilaGiro onChange={setBearing} />
        {me && <MeMarker pos={me} heading={heading} bearing={bearing} />}
        {placing && <PlacePicker onPick={setPos} />}
        {pos && <Marker position={pos} />}
      </MapContainer>

      <SearchBox me={me} onSelect={(f) => { setGoto([f.latitude, f.longitude]); setSelectedID(f.id) }} onSelectPlace={setPlace} />

      <div className="map-controls">
        {/* Botón que despliega/esconde las herramientas. El puntito avisa si hay
            filtros activos mientras están plegadas, para no ocultarlo en silencio. */}
        <Badge color="primary" variant="dot" invisible={controlsOpen || activeFilters === 0} overlap="circular">
          <Fab
            size="medium"
            onClick={() => setControlsOpen((v) => !v)}
            aria-label={t(controlsOpen ? 'map.hideTools' : 'map.showTools')}
            title={t(controlsOpen ? 'map.hideTools' : 'map.showTools')}
            sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
          >
            {controlsOpen ? <CloseIcon /> : <TuneIcon />}
          </Fab>
        </Badge>
        {/* Debajo del de herramientas: los filtros se despliegan más abajo, así que
            este no se mueve al abrirlos. */}
        <LayerPicker layer={layer} onChange={setLayer} />
        {/* Rutas propuestas. Vive con los botones del mapa y no en la cabecera porque
            lo que hace es SOBRE el mapa: te lleva de parada en parada. */}
        <Fab
          size="medium"
          onClick={() => setMissionsOpen(true)}
          aria-label={t('mission.title')}
          title={t('mission.title')}
          sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
        >
          <RouteOutlinedIcon />
        </Fab>
        {/* En escritorio siguen desplegándose aquí mismo, junto al botón que las abre.
            En móvil van a una hoja: una columna de chips flotando sobre el mapa tapa
            justo lo que estás mirando, y son objetivos pequeños para el pulgar. */}
        {!movil && (
          <Collapse in={controlsOpen} sx={{ '& .MuiCollapse-wrapperInner': { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' } }}>
            {filtros('escritorio')}
          </Collapse>
        )}
      </div>
      {movil && (
        <BottomSheet open={controlsOpen} onClose={() => setControlsOpen(false)} titulo={t('map.filters')}>
          <Stack spacing={1.25}>{filtros('movil')}</Stack>
        </BottomSheet>
      )}
      {geoError && <div className="hint hint-error">{geoError}</div>}

      <MapLegend />

      {showNearby && me && (
        <NearbyPanel pos={me} onClose={() => setShowNearby(false)} onFocus={focusFont} selectedID={selectedID} />
      )}

      {!placing && (
        <div className="map-fabs">
          <Compass
            bearing={bearing}
            onReset={() => {
              map?.setBearing(0)
              // Aprovechamos el gesto para pedirle a iOS el sensor de orientación.
              void enableCompass()
            }}
          />
          <Fab size="medium" onClick={() => locate(false)} title={t('map.recenter')} aria-label={t('map.recenter')} sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}>
            <NearMeIcon />
          </Fab>
          {user && (
            <Fab variant="extended" color="primary" onClick={startPlacing}>
              <AddIcon sx={{ mr: 1 }} /> {noEmoji(t('map.addFont'))}
            </Fab>
          )}
        </div>
      )}
      {placing && !pos && (
        <div className="hint">
          {t('map.tapToPlace')} · <button className="link" onClick={cancel}>{t('map.cancel')}</button>
        </div>
      )}
      {placing && pos && <NewFontForm pos={pos} onCancel={cancel} onCreated={created} />}

      {/* El punto de partida es donde está el usuario si el mapa ya lo sabe; si no, el
          panel lo pide él (y solo en silencio si el permiso ya estaba dado). */}
      <MissionsPanel
        open={missionsOpen}
        onClose={() => setMissionsOpen(false)}
        center={me}
        onFocus={(target) => { setGoto([target.latitude, target.longitude]); setSelectedID(target.id) }}
      />
    </div>
  )
}
