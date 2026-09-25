import { SavedOuting } from '../components/SavedOuting'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Chip from '@mui/material/Chip'
import Fab from '@mui/material/Fab'
import Badge from '@mui/material/Badge'
import Collapse from '@mui/material/Collapse'
import Popover from '@mui/material/Popover'
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
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import NearMeOutlinedIcon from '@mui/icons-material/NearMeOutlined'
import NavigationIcon from '@mui/icons-material/Navigation'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import DoNotDisturbAltIcon from '@mui/icons-material/DoNotDisturbAlt'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CloseIcon from '@mui/icons-material/Close'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import TuneIcon from '@mui/icons-material/Tune'
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined'
import VerifiedIcon from '@mui/icons-material/Verified'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import L, { type LatLng, type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '../leafletSetup'
import { MeMarker, MeMarkerNav } from '../components/MeMarker'
import { Compass } from '../components/Compass'
import { useHeading } from '../lib/useHeading'
import { decideNavegando, velocidadMs, rumboEntre } from '../lib/navMode'
import { guardaFix, leeFix } from '../lib/lastFix'
import { claveAvisoTrasDenegar, type EstadoPermiso } from '../lib/geoNotice'
import {
  modoTrasToque, MODO_TRAS_GESTO, sigueUbicacion, orientaAlRumbo,
  botonRelleno, iconoDeModo, bearingRumboArriba, modoVisible, MODO_INICIAL,
  zoomAlUbicar, type ModoUbicacion,
} from '../lib/locateMode'
// Parchea L.Map para poder girar el mapa con dos dedos. Se importa por su efecto.
import 'leaflet-rotate'

import type { Drinkable, Font, FontSummary, MapCluster, MapResponse, Page, WaterSource } from '../api/types'
import { ApiError, apiFetch, createComment, createFont, describeError, getRain, nearbyFonts, requestSourceLimitExemption, trackInteraction, uploadImage } from '../api/client'
import { cajaRedondeada, paramsDeCaja } from '../lib/cajaMapa'
import { casillaDe } from '../lib/casilla'
import { cercanasEn, enCaja } from '../lib/zonaOffline'
import { fuentesTrasFalloDeRed } from '../lib/mapFallback'
import { recuerdaVistas } from '../lib/fuentesVistas'
import { zonaGuardada } from '../lib/zonaAlmacen'
import { nombreFuente } from '../lib/fontName'
import { distanceMetres, isRemotePlacement, newFontPosition } from '../lib/newFontPlacement'
import { placementIcon, statusIcon } from '../lib/statusMarker'
import { clearRecentHistory, recentFountains, recentSearches, rememberFountain, rememberSearch, type RecentFountain } from '../lib/recentHistory'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../components/ToastContext'
import { ClusteredMarkers } from '../components/ClusteredMarkers'
import { BaseLayerTile, LayerPicker, useBaseLayer } from '../components/BaseLayers'
import { BottomSheet } from '../components/BottomSheet'
import { ZonaOfflineSheet } from '../components/ZonaOfflineSheet'
import { MissionsPanel } from '../components/MissionsPanel'
import { WaterTypeHelpButton, DrinkableHelpButton } from '../components/WaterHelp'
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
import { isReliable } from '../lib/confidence'
import { ConfidenceChip } from '../components/ConfidenceChip'
import { ExportGpxButton } from '../components/ExportGpxButton'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import CloudDownloadIcon from '@mui/icons-material/CloudDownloadOutlined'
import { NuevoBadge } from '../components/NuevoBadge'
import { RelocateFont } from '../components/RelocateFont'
import { MapEasterEggs } from '../components/MapEasterEggs'
import { defaultViewFor, deviceTimeZone, parseSavedMapView, vistaAlAbrir, type SavedMapView } from '../lib/mapView'
import { loginNext } from '../lib/nextParam'
import { MapHelpOverlay } from '../components/MapHelpOverlay'
import { sesiones } from '../lib/asks'

// Default view for someone who has not shared a location yet: their country, guessed
// from the device time zone (see `defaultViewFor`); Madrid at zoom 5 when unknown.
const DEFAULT = defaultViewFor(deviceTimeZone())
const DEFAULT_CENTER: [number, number] = [DEFAULT.lat, DEFAULT.lng]
const DEFAULT_ZOOM = DEFAULT.zoom

// Última vista del mapa (centro + zoom). Se guarda en DOS sitios, y la diferencia
// importa:
//
//  · `sessionStorage` es **estado de navegación**: dónde estabas dentro de esta sesión.
//    Que exista significa «venías de otro sitio» (del detalle de una fuente, de una
//    búsqueda), y por eso **desactiva la ubicación automática** al montar: ya dijiste
//    dónde querías mirar y moverte el mapa a tu posición sería deshacerlo.
//
//  · `localStorage` es el **respaldo al abrir en frío**, y no significa nada sobre tu
//    intención de ahora. Antes no existía y al abrir la app se caía en el centro por
//    defecto, que es Madrid a zoom 5. Estaba tapado porque al abrir nos ubicábamos solos
//    si el permiso ya estaba dado; pero en iOS el permiso de ubicación de una web
//    **caduca cada 24 horas**, así que ese respaldo no está y el mapa aparecía en Madrid
//    todos los días. Reportado por alguien con la PWA instalada.
//
// Confundir los dos es el error fácil: si el respaldo también contara como «venías de
// otro sitio», la ubicación automática no volvería a ejecutarse JAMÁS después de la
// primera vez.
const VIEW_KEY = 'fontapp_map_view'

/** Lo guardado en los dos sitios, en crudo. La decisión la toma `vistaAlAbrir`. */
function guardado(): { sesion: string | null; ultima: string | null } {
  const lee = (a: Storage) => { try { return a.getItem(VIEW_KEY) } catch { return null } }
  return {
    sesion: typeof sessionStorage === 'undefined' ? null : lee(sessionStorage),
    ultima: typeof localStorage === 'undefined' ? null : lee(localStorage),
  }
}

/** Dónde estabas en ESTA sesión. Su presencia desactiva la ubicación automática. */
function loadView(): SavedMapView | null {
  return parseSavedMapView(guardado().sesion)
}

function saveView(v: SavedMapView) {
  const json = JSON.stringify(v)
  try {
    sessionStorage.setItem(VIEW_KEY, json)
  } catch {
    /* almacenamiento no disponible: no pasa nada, solo no recordaremos la vista */
  }
  try {
    localStorage.setItem(VIEW_KEY, json)
  } catch {
    /* idem */
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
/**
 * Los filtros del mapa, tal y como se guardan.
 *
 * ## Por qué `hideNonPotable` y no `showNonPotable`
 *
 * Estaba al revés: el mapa **escondía por defecto** las fuentes marcadas como no potables
 * y había que activar un filtro para verlas. El efecto, reportado por quien lo sufrió
 * varias veces: marcas una fuente como no potable y **desaparece delante de tus ojos**.
 * No es solo confuso — la fuente sigue existiendo, así que la siguiente persona (o tú
 * mismo) la vuelve a añadir, y el resultado es un **duplicado**, que es de lo que peor se
 * limpia en esta base.
 *
 * Esconder no potable es además discutible como comportamiento por defecto: una fuente
 * marcada como no potable sigue siendo un punto útil —para el perro, para mojarse la
 * cabeza, para saber que ESA no vale y no volver a mirarla— y en un mapa que existe para
 * decir la verdad sobre el agua, borrar del mapa lo que alguien acaba de contar es
 * castigar justo la aportación que más cuesta.
 *
 * Ahora se ven siempre salvo que alguien pida esconderlas.
 */
type SavedFilters = { onlyWithWater: boolean; onlyReliable: boolean; hideNonPotable: boolean; source: WaterSource | 'all' }
const SIN_FILTROS: SavedFilters = { onlyWithWater: false, onlyReliable: false, hideNonPotable: false, source: 'all' }
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
      onlyReliable: v.onlyReliable === true,
      // El `showNonPotable` de antes **no se migra a propósito**. Para casi todo el mundo
      // no era una elección: era el valor por defecto, y traducirlo a `hideNonPotable:
      // true` dejaría el arreglo sin efecto justo para quien ya tiene filtros guardados,
      // que es la gente que reportó el problema. Quien de verdad las quiera escondidas
      // tiene el chip a un toque.
      hideNonPotable: v.hideNonPotable === true,
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
//
// Con freno de ritmo: la flecha de navegación recentra el mapa en cada frame, así que sin
// esto se escribiría en `localStorage` decenas de veces por segundo. Basta con guardar la
// última vista de vez en cuando —es un respaldo para reabrir, no un dato al segundo—.
function PersistView() {
  const ultima = useRef(0)
  const map = useMapEvents({
    moveend: () => {
      if (Date.now() - ultima.current < 1000) return
      ultima.current = Date.now()
      const c = map.getCenter()
      saveView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
    },
  })
  return null
}

// Avisa cuando el usuario toma el control del mapa (arrastrar, rueda, pellizco).
//
// El zoom lo dispara tanto el usuario (rueda, pellizco) como nuestros reencuadres
// (`FocusOn`, «centrar en mí»), y hay que distinguirlos: si un reencuadre nuestro contara
// como gesto, «centrar en mí» se desengancharía él solo al instante. Antes se miraba
// `zoomstart.originalEvent`, pero en el **pellizco móvil con leaflet-rotate** ese campo no
// siempre llega, así que el zoom del usuario NO desenganchaba y el siguiente fix del GPS
// lo devolvía a su sitio — reportado caminando. Ahora se marca `marca` justo antes de
// cada movimiento nuestro y se limpia al terminar (`moveend`/`zoomend`), que es
// determinista y no depende del navegador.
function DetectaGestoDelUsuario({ onGesto, marca }: { onGesto: () => void; marca: React.MutableRefObject<boolean> }) {
  useMapEvents({
    dragstart: onGesto,                       // arrastrar es siempre del usuario
    zoomstart: () => { if (!marca.current) onGesto() },  // rueda/pellizco, no lo nuestro
    moveend: () => { marca.current = false },
    zoomend: () => { marca.current = false },
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
/**
 * Lo mínimo para que algo se lea **encima del mapa**.
 *
 * Un control flotante sin fondo propio se pinta sobre teselas: bosque verde, mar azul,
 * ortofoto. Un `variant="outlined"` de MUI es transparente, así que ahí el texto compite
 * con lo que haya debajo y desaparece — pasó con los dos botones de GPX, que salieron
 * ilegibles sobre el Mediterráneo mientras los chips de al lado se leían perfectamente.
 *
 * La regla ya existía dentro de `chipSx`; está aquí fuera para que el siguiente control
 * que se cuelgue del mapa la herede en vez de tener que descubrirla otra vez.
 *
 * No es una cuestión de gusto ni de daltonismo: es **contraste**. Un fondo opaco resuelve
 * el problema para todo el mundo, y de paso hace que el color deje de ser lo único que
 * separa el control del fondo.
 */
export const sobreElMapaSx = {
  bgcolor: 'background.paper',
  color: 'text.primary',
  borderColor: 'divider',
  boxShadow: 3,
  // `&&` para ganarle al hover translúcido de MUI, igual que en `chipSx`: si al pasar por
  // encima se vuelve semitransparente, vuelve el problema justo al ir a pulsar.
  '&&:hover': {
    boxShadow: 6,
    backgroundColor: (theme: Theme) =>
      theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200],
  },
}

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
    .map((f) => [f.id, f.latitude, f.longitude, f.name, f.source, f.drinkable, f.lastWaterStatus, f.lastUpdate,
      f.latestConfirmations, f.recentStatusReporters, f.recentStatusConflict].join('|'))
    .join('~')
}

function firmaDeClusters(l: MapCluster[]): string {
  return l.map((c) => [c.latitude, c.longitude, c.count].join('|')).join('~')
}

/** Máximo ritmo de recarga del mapa mientras el mapa se mueve SOLO (seguimiento/
 *  navegación). Ver el antiavalancha en `FontMarkers`. */
const MIN_GAP_SIGUIENDO_MS = 8000

function FontMarkers({
  nonce,
  onlyWithWater,
  onlyReliable,
  hideNonPotable,
  sourceFilter,
  selectedID,
  siguiendoRef,
  onDensityModeChange,
}: {
  nonce: number
  onlyWithWater: boolean
  onlyReliable: boolean
  hideNonPotable: boolean
  sourceFilter: WaterSource | 'all'
  selectedID: string | null
  siguiendoRef: React.MutableRefObject<boolean>
  onDensityModeChange: (visible: boolean) => void
}) {
  const [mapData, setMapData] = useState<{ fonts: FontSummary[]; clusters: MapCluster[] }>({
    fonts: [], clusters: [],
  })
  // Una respuesta lenta de la vista anterior no puede borrar la vista nueva.
  const requestNumber = useRef(0)
  // Tampoco debe seguir consumiendo recursos: en el mapa solo importa la última caja.
  const activeRequest = useRef<AbortController | null>(null)
  // Un 429 tiene que verse. Sin esto caía en el mismo `catch` que la falta de red y el
  // mapa se quedaba mudo: **indistinguible de estar rota**, que es justo el síntoma que
  // se reportó desde una ruta con 3G. El tope de lectura son 600/h y hacen falta unas
  // tres horas seguidas para tocarlo, pero cuando pase, que se entienda.
  const [topeHasta, setTopeHasta] = useState<number | null>(null)

  const loadBounds = useCallback(async (map: LeafletMap) => {
    const b = map.getBounds()
    const size = map.getSize()
    // La caja se redondea HACIA FUERA a una rejilla, y el tamaño se cuantiza.
    //
    // Antes iba en flotantes completos más el alto exacto en píxeles, y el service worker
    // cachea por URL exacta: un píxel de diferencia —la franja de avisos que aparece, la
    // barra del navegador que se pliega— era otra URL. Reabrir la app sin cobertura en la
    // misma vista fallaba el caché y **el mapa salía en blanco**. Pasó de verdad.
    //
    // Hacia fuera y no al más cercano: la caja pedida tiene que cubrir lo que se ve, o
    // aparecería una franja sin fuentes sin que fallara ninguna petición.
    const caja = cajaRedondeada(
      { minLat: b.getSouth(), maxLat: b.getNorth(), minLong: b.getWest(), maxLong: b.getEast() },
      { width: size.x, height: size.y },
      map.getZoom(),
    )
    const params = paramsDeCaja(caja)
    const mine = ++requestNumber.current
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    try {
      let nuevas: MapResponse
      try {
        nuevas = await apiFetch<MapResponse>(`/fonts/map?${params}`, { signal: controller.signal })
      } catch (error) {
        // Permite desplegar web y API en cualquier orden (y hacer rollback): un backend
        // anterior responde 404 y todavía expone el endpoint limitado. Un timeout, 5xx
        // o cancelación NO debe lanzar además esa consulta cara: duplicaría la carga
        // precisamente cuando el servidor ya está sufriendo.
        if (!(error instanceof ApiError) || error.status !== 404) throw error
        const fonts = await apiFetch<FontSummary[]>(`/fonts/in-bounds?${params}`, { signal: controller.signal })
        nuevas = { total: fonts.length, fonts, clusters: [] }
      }
      if (mine !== requestNumber.current) return
      // Apunta lo cargado para que la ficha funcione offline sin haber guardado zona:
      // si ves el pin, tocarlo debe abrir su info aunque se vaya la cobertura.
      recuerdaVistas(nuevas.fonts)
      // Se conserva el array anterior si lo que se pinta no ha cambiado. Cambiar su
      // identidad reconstruye TODOS los marcadores, que es caro y además se lleva por
      // delante el popup abierto — y recentrar el mapa estando parado devuelve
      // exactamente las mismas fuentes.
      setMapData((prev) => (
        firmaDeFuentes(prev.fonts) === firmaDeFuentes(nuevas.fonts)
        && firmaDeClusters(prev.clusters) === firmaDeClusters(nuevas.clusters)
          ? prev
          : { fonts: nuevas.fonts, clusters: nuevas.clusters }
      ))
    } catch (error) {
      // Sin red, la zona guardada. Antes esto dejaba el mapa vacío: la lista de cercanas
      // sí caía a la zona pero el mapa no, así que el excursionista veía sus fuentes en
      // una lista y ninguna en el mapa. Se reportó probándolo en el monte.
      if (mine !== requestNumber.current) return
      if (error instanceof ApiError && error.status === 429) {
        setTopeHasta(Date.now() + (error.retryAfterSeconds ?? 60) * 1000)
      }
      const zona = await zonaGuardada()
      const deZona = zona ? enCaja(zona, caja) : null
      // Sin zona guardada NO se vacía el mapa: se conservan los marcadores que ya
      // estaban (ver `fuentesTrasFalloDeRed`). Vaciar era el bug reportado en el campo —
      // al perder cobertura desaparecían todos los puntos que ya se veían. Va en la forma
      // funcional para leer `prev` sin capturar un `mapData` viejo en este `useCallback`.
      setMapData((prev) => {
        const fonts = fuentesTrasFalloDeRed(prev.fonts, deZona)
        return firmaDeFuentes(prev.fonts) === firmaDeFuentes(fonts) ? prev : { fonts, clusters: [] }
      })
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }, [])

  // ## Antiavalancha de peticiones al SEGUIR
  //
  // Cada `moveend` dispara una carga de `/fonts/map`. Estando quieto y explorando a mano
  // eso está bien: cada movimiento es una intención. Pero cuando el mapa **se mueve solo**
  // —el seguimiento en coche, y sobre todo la flecha de navegación, que recentra el mapa
  // en CADA frame— son decenas de `moveend` por segundo, decenas de peticiones por
  // segundo, y el tope de 600/h por IP se agota en segundos. Medido en producción el
  // 13/09/2026 (ráfaga de 94 rechazos en 3 s): el mapa se queda mudo y hasta el alta de
  // fuente se bloquea, porque comparten IP. Reportado conduciendo por el Montseny.
  //
  // Siguiendo, como mucho una carga cada `MIN_GAP_SIGUIENDO_MS`: las fuentes no cambian en
  // ese rato y a velocidad de coche son unos cientos de metros. Explorando a mano no se
  // limita (`gap` 0), para que cada arrastre responda al instante. La cola de arrastre
  // garantiza una carga al final del intervalo, así el mapa se pone al día aunque el
  // seguimiento no pare nunca.
  const ultimaCargaMov = useRef(0)
  const cargaDiferida = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cargaAlMover = useCallback((map: LeafletMap) => {
    const gap = siguiendoRef.current ? MIN_GAP_SIGUIENDO_MS : 0
    const desde = Date.now() - ultimaCargaMov.current
    clearTimeout(cargaDiferida.current)
    if (desde >= gap) {
      ultimaCargaMov.current = Date.now()
      loadBounds(map)
    } else {
      cargaDiferida.current = setTimeout(() => {
        ultimaCargaMov.current = Date.now()
        loadBounds(map)
      }, gap - desde)
    }
  }, [loadBounds, siguiendoRef])

  const map = useMapEvents({
    moveend: () => cargaAlMover(map),
  })

  // Un solo `invalidateSize` a 100 ms se quedaba corto: llegando por navegación SPA
  // desde la ficha («ver en el mapa»), a veces el contenedor aún no está dispuesto en
  // ese instante, Leaflet calcula tamaño 0 y el mapa aparece en blanco hasta que
  // mueves la vista —único momento en que se recarga—. Reportado en escritorio.
  //
  // Ahora se reintenta hasta que el contenedor tiene tamaño real (con tope de ~2 s) y,
  // ya con tamaño, se invalida una vez más en el frame siguiente: `invalidateSize` no
  // siempre repinta las teselas del área que acaba de destaparse, y ese segundo pase
  // las trae. Con el mapa ya bien dimensionado el primer intento acierta y no se nota.
  useEffect(() => {
    let cancelado = false
    let reintento: ReturnType<typeof setTimeout> | undefined
    let raf: number | undefined
    const intenta = (restantes: number) => {
      if (cancelado) return
      const c = map.getContainer()
      if (c.clientWidth > 0 && c.clientHeight > 0) {
        map.invalidateSize()
        loadBounds(map)
        raf = requestAnimationFrame(() => { if (!cancelado) map.invalidateSize() })
        return
      }
      if (restantes > 0) reintento = setTimeout(() => intenta(restantes - 1), 120)
    }
    reintento = setTimeout(() => intenta(16), 100)
    return () => {
      cancelado = true
      if (reintento) clearTimeout(reintento)
      if (raf) cancelAnimationFrame(raf)
      clearTimeout(cargaDiferida.current)
      activeRequest.current?.abort()
    }
  }, [map, loadBounds, nonce])

  // Memorizado a propósito, no por rendimiento: `.filter()` suelto devolvía un array
  // nuevo en CADA render, y este componente repinta con cada posición del GPS (cada
  // pocos segundos mientras caminas). Como `ClusteredMarkers` reconstruye los
  // marcadores cuando cambia la identidad del array, el popup que acababas de abrir se
  // destruía solo al segundo siguiente, sin que hubiera cambiado ni un dato.
  const shown = useMemo(() => {
    let l = hideNonPotable ? mapData.fonts.filter((f) => !isNotPotable(f.drinkable)) : mapData.fonts
    if (onlyWithWater) l = l.filter(hasWater)
    if (onlyReliable) l = l.filter(isReliable)
    if (sourceFilter !== 'all') l = l.filter((f) => f.source === sourceFilter)
    return l
  }, [mapData.fonts, hideNonPotable, onlyWithWater, onlyReliable, sourceFilter])
  return (
    <>
      <ClusteredMarkers
        fonts={shown}
        clusters={mapData.clusters}
        selectedID={selectedID}
        onDensityModeChange={onDensityModeChange}
      />
      {topeHasta && <AvisoDeTope hasta={topeHasta} onFin={() => { setTopeHasta(null); loadBounds(map) }} />}
    </>
  )
}

/**
 * «Has hecho demasiadas consultas seguidas», sobre el mapa.
 *
 * Sin esto un 429 caía en el mismo `catch` que la falta de red y el mapa se quedaba mudo:
 * indistinguible de estar rota, que es el peor error posible aquí y justo el síntoma que
 * ya se reportó desde una ruta con 3G.
 *
 * **Se va solo y recarga el mapa.** El tope es una ventana deslizante, así que la cuota
 * vuelve sin que nadie toque nada; dejar el aviso puesto —o dejar el mapa vacío hasta que
 * la persona lo mueva otra vez— convertiría algo temporal en algo que parece roto.
 */
function AvisoDeTope({ hasta, onFin }: { hasta: number; onFin: () => void }) {
  const { t } = useI18n()
  // `onFin` va por `ref` y NO en las dependencias: es una función nueva en cada render y
  // este componente vive dentro del mapa, que repinta con **cada posición del GPS**. Con
  // ella en la lista, el temporizador se cancelaría y se recrearía cada pocos segundos y
  // no llegaría a saltar nunca — el aviso se quedaría puesto para siempre, que es el
  // fallo silencioso de este cambio.
  const fin = useRef(onFin)
  fin.current = onFin
  useEffect(() => {
    // `Retry-After` puede venir en horas; se despierta como muy tarde en un minuto para
    // no tener un temporizador durmiendo media tarde en un móvil.
    const espera = Math.min(Math.max(hasta - Date.now(), 0), 60_000)
    const id = setTimeout(() => fin.current(), espera)
    return () => clearTimeout(id)
  }, [hasta])
  const minutos = Math.max(1, Math.ceil((hasta - Date.now()) / 60_000))
  return (
    <div className="hint" role="status">
      <strong>{t('map.rateLimited')}</strong>
      <div>{t('error.tooManyRetry', { minutes: minutos })}</div>
      <div style={{ opacity: 0.75 }}>{t('map.rateLimitedBody')}</div>
    </div>
  )
}

// Captura el clic en el mapa para situar la nueva fuente.
function PlacePicker({ onPick }: { onPick: (pos: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng) })
  return null
}

/** Cuánto hay que mantener el dedo. Medio segundo es el estándar de facto de los mapas. */
const PULSACION_LARGA_MS = 500

/**
 * Cuánto se ve el pin **solo**, antes de que salga el formulario.
 *
 * Se pidió esto al probar la pulsación larga y en su momento se resolvió de otra manera
 * —desplazando el mapa para que el pin asomara por encima del formulario (`AsomaElPin`)—,
 * con el argumento de que dos segundos de espera se pagan en **cada** alta. Reportado otra
 * vez sobre el terreno, y con razón: en móvil el formulario **tapa el 73 % del mapa**
 * (medido: 509 px de 699 en una pantalla de 375×812), así que asomar el pin por la franja
 * que queda no basta para registrar dónde ha caído. Ahora se hacen las dos cosas.
 *
 * El pin cae **al instante** con su vibración; lo que espera es el formulario. Esa espera
 * no es tiempo muerto: es el único momento en que se ve el punto exacto que has marcado
 * sin nada delante, que es lo que hay que comprobar antes de escribir nada. `AsomaElPin`
 * sigue haciendo falta para lo de después, cuando el formulario ya está.
 *
 * **Medio segundo y no dos.** Se probaron los dos y dos se hacen largos en cada alta —el
 * gesto ya ha costado otro medio segundo de pulsación—; con medio basta para ver caer el
 * pin, que es lo único que hacía falta.
 */
const ESPERA_ANTES_DEL_FORMULARIO_MS = 500

/**
 * Cuánto se queda la invitación a crear cuenta tras una pulsación larga sin sesión.
 *
 * Seis segundos y no los 2,6 del toast de la app: aquí no se anuncia algo que ya ha
 * pasado, se pide una decisión y hay que leer una línea, entenderla y llegar al enlace.
 * Con el plazo del toast, tocarlo sería una carrera. Y se va sola porque nadie tiene que
 * cerrar un aviso que él no pidió.
 */
const INVITACION_MS = 6000
/** Si el dedo se mueve más que esto, es un arrastre del mapa y no una pulsación. */
const TOLERANCIA_PX = 12

/**
 * Añadir una fuente con una pulsación larga sobre el mapa.
 *
 * ## Por qué
 *
 * Es el gesto que cualquiera espera de un mapa, y sobre todo **quita pasos de la única
 * acción que importa**: con el botón hay que pulsarlo, esperar a que el pin caiga donde el
 * algoritmo decida y arrastrarlo hasta el sitio. Aquí el sitio es el del dedo.
 *
 * ## Y por eso manda sobre el GPS
 *
 * `newFontPosition` coloca el pin en tu posición si el centro del mapa está a menos de 250
 * m, y hace bien: el caso normal es estar delante de la fuente. Pero una pulsación larga
 * es la intención **más explícita que existe** —has señalado un punto con el dedo—, así
 * que aquí no se consulta esa regla. El aviso de distancia del formulario sigue saliendo
 * igual, que es lo que protege de colocar una fuente a diez kilómetros sin darse cuenta.
 *
 * ## Se detecta a mano y no con `contextmenu`
 *
 * Leaflet solo convierte la pulsación larga en `contextmenu` en Safari móvil (su
 * `tapHold`), así que en Android Chrome no llegaría nunca — y encima el navegador enseña
 * su propio menú. Con `touchstart`/`touchend` funciona igual en los dos, que es lo que
 * hace que esto sea una función y no una sorpresa para la mitad de la gente.
 */
function LongPressToAdd({ onAdd }: { onAdd: (pos: LatLng) => void }) {
  const map = useMap()
  useEffect(() => {
    const contenedor = map.getContainer()
    let reloj: number | null = null
    let inicio: { x: number; y: number } | null = null

    const cancela = () => {
      if (reloj !== null) { clearTimeout(reloj); reloj = null }
      inicio = null
    }

    // No se dispara encima de un pin ni de los controles: ahí la pulsación larga significa
    // otra cosa (o nada), y colocar una fuente debajo de un marcador es justo el caso en
    // el que probablemente ya existe.
    const sobreAlgo = (destino: EventTarget | null) =>
      destino instanceof Element && !!destino.closest(
        '.leaflet-marker-icon, .leaflet-popup, .leaflet-control, .map-controls, .search, .panel, .nearby, .legend, .map-fabs')

    const empieza = (x: number, y: number, destino: EventTarget | null) => {
      if (sobreAlgo(destino)) return
      inicio = { x, y }
      reloj = window.setTimeout(() => {
        reloj = null
        if (!inicio) return
        const punto = map.containerPointToLatLng(
          L.point(inicio.x - contenedor.getBoundingClientRect().left,
                  inicio.y - contenedor.getBoundingClientRect().top))
        inicio = null
        // Un toque en el móvil: sin esto el gesto se completa sin que pase nada visible
        // hasta que aparece el formulario, y se duda de si ha funcionado.
        navigator.vibrate?.(15)
        onAdd(punto)
      }, PULSACION_LARGA_MS)
    }

    const alTocar = (e: TouchEvent) => {
      if (e.touches.length !== 1) return cancela()   // dos dedos es zoom o giro
      empieza(e.touches[0].clientX, e.touches[0].clientY, e.target)
    }
    const alMover = (e: TouchEvent) => {
      if (!inicio || e.touches.length === 0) return
      const dx = e.touches[0].clientX - inicio.x
      const dy = e.touches[0].clientY - inicio.y
      if (Math.hypot(dx, dy) > TOLERANCIA_PX) cancela()
    }

    contenedor.addEventListener('touchstart', alTocar, { passive: true })
    contenedor.addEventListener('touchmove', alMover, { passive: true })
    contenedor.addEventListener('touchend', cancela)
    contenedor.addEventListener('touchcancel', cancela)
    // En escritorio, el equivalente natural es el botón derecho. Leaflet ya lo publica
    // como `contextmenu` del mapa, así que ahí no hace falta temporizador.
    const alBotonDerecho = (e: L.LeafletMouseEvent) => {
      if (sobreAlgo(e.originalEvent.target)) return
      onAdd(e.latlng)
    }
    map.on('contextmenu', alBotonDerecho)
    // El mapa moviéndose cancela: un arrastre con inercia no debe acabar en un formulario.
    map.on('movestart zoomstart', cancela)

    return () => {
      cancela()
      contenedor.removeEventListener('touchstart', alTocar)
      contenedor.removeEventListener('touchmove', alMover)
      contenedor.removeEventListener('touchend', cancela)
      contenedor.removeEventListener('touchcancel', cancela)
      map.off('contextmenu', alBotonDerecho)
      map.off('movestart zoomstart', cancela)
    }
  }, [map, onAdd])
  return null
}

/**
 * Asoma el pin recién puesto por encima del formulario.
 *
 * Reportado probando la pulsación larga: el pin cae donde has tocado y el formulario, que
 * sale de abajo, lo tapa — así que no ves dónde ha quedado justo cuando más importa, que
 * es antes de escribir el nombre.
 *
 * Se propuso **enseñar el pin dos segundos y luego el formulario**, y hace lo mismo peor:
 * son dos segundos de espera en cada alta y al terminar el pin vuelve a estar tapado. Aquí
 * el mapa se desplaza y el pin **se queda visible todo el rato**, que es lo que de verdad
 * hacía falta; y el propio desplazamiento ya es la señal de que ha pasado algo.
 *
 * Es la misma idea que `FocusOn` con la lista de cercanas, y por eso la cuenta es igual:
 * centrar en la mitad del hueco que queda libre. Solo se hace **al colocar el pin la
 * primera vez** — si te movieras el mapa cada vez que tocas para afinar la posición, sería
 * imposible afinar nada.
 */
function AsomaElPin({ pos, activo }: { pos: LatLng | null; activo: boolean }) {
  const map = useMap()
  const yaAsomado = useRef(false)
  useEffect(() => {
    if (!activo) { yaAsomado.current = false; return }
    if (!pos || yaAsomado.current) return
    // Un instante de espera para medir el formulario ya pintado; midiendo en el mismo
    // render daría la pantalla sin él.
    //
    // Es `setTimeout` y **no `requestAnimationFrame`**, que era lo natural: los
    // navegadores congelan los fotogramas cuando la pestaña no se ve, así que el
    // desplazamiento no llegaba a ocurrir nunca y el pin se quedaba tapado sin ningún
    // error por medio. Se vio instrumentando: el efecto entraba y el fotograma no salía.
    //
    // Y la marca se pone **dentro**, no antes de programar la espera: puesta antes, en
    // desarrollo no se desplazaba nunca, porque React monta los efectos dos veces, la
    // limpieza cancela la primera espera y la segunda se encuentra la marca ya puesta.
    const id = window.setTimeout(() => {
      const panel = document.querySelector('.panel') as HTMLElement | null
      if (!panel) return
      yaAsomado.current = true
      const mapRect = map.getContainer().getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const punto = map.latLngToContainerPoint(pos)
      const hueco = panelRect.top - mapRect.top
      // Ya se ve con holgura: no se toca el mapa. Mover por mover desorienta.
      if (punto.y < hueco - 32) return
      // Sin animación a propósito. La de Leaflet también va por fotogramas, así que se
      // queda a medias en cuanto el navegador los frena —medido: el pin se movía 3 px de
      // los 480 que le tocaban— y ese fallo solo aparece a veces, que es lo peor. Además
      // el pin y el formulario salen a la vez: un salto instantáneo se lee igual de bien
      // que un deslizamiento.
      map.panBy([0, Math.round(punto.y - hueco / 2)], { animate: false })
    }, 32)
    return () => clearTimeout(id)
  }, [map, pos, activo])
  return null
}

// Enfoca una fuente centrándola en el área visible por ENCIMA del panel inferior
// (bottom-sheet "cerca de ti"), para que el pin no quede tapado por la lista.
// Centra el mapa en `latlng` al `zoom` dado, dejando el punto en el hueco visible por
// ENCIMA del bottom-sheet de «cerca de ti» si está abierto (para que no lo tape la lista).
// Compartido por FocusOn (enfocar una fuente, zoom fijo) y CentraEnMi (ubicarse, tu zoom).
function centraConHueco(map: LeafletMap, latlng: LatLng, zoom: number) {
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
}

// Enfoca una FUENTE (buscar, una ficha, una parada): zoom fijo 16, porque la intención es
// verla de cerca. Distinto de ubicarse, que conserva tu zoom (ver CentraEnMi).
function FocusOn({ target, marca }: { target: [number, number] | null; marca: React.MutableRefObject<boolean> }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    marca.current = true // reencuadre nuestro: que no lo lea como gesto del usuario
    centraConHueco(map, L.latLng(target[0], target[1]), 16)
  }, [target, map, marca])
  return null
}

// Ubicarse (botón de la flecha): centra en ti CONSERVANDO tu zoom, y solo acerca si estabas
// muy alejado. Forzar zoom 16 aquí alejaba de golpe a quien ya estaba cerca poniendo
// fuentes — reportado. La regla de zoom vive en `zoomAlUbicar`.
function CentraEnMi({ target, marca }: { target: [number, number] | null; marca: React.MutableRefObject<boolean> }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    marca.current = true
    centraConHueco(map, L.latLng(target[0], target[1]), zoomAlUbicar(map.getZoom()))
  }, [target, map, marca])
  return null
}

// Sigue al usuario mientras camina: lo reencuadra SIN tocar el zoom. El seguimiento iba
// antes por `goto`/`FocusOn`, que fuerza zoom 16, así que cada fix del GPS deshacía el
// zoom que el usuario acababa de hacer y lo devolvía al predeterminado — el fallo que se
// notaba sobre todo en movimiento, porque parado el filtro de 15 m descarta los fixes.
// `panTo` conserva el zoom actual; solo desplaza.
function SigueAlUsuario({ pos, marca }: { pos: [number, number] | null; marca: React.MutableRefObject<boolean> }) {
  const map = useMap()
  useEffect(() => {
    if (!pos) return
    marca.current = true
    map.panTo(pos, { animate: true })
  }, [pos, map, marca])
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
  const { t } = useI18n()
  const map = useMap()
  return (
    <Paper className="zoom-ctrl" data-map-help="zoom" elevation={3} sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column', borderRadius: 3, overflow: 'hidden' }}>
      <IconButton size="small" onClick={() => map.zoomIn()} aria-label={t('map.zoomIn')}><AddIcon fontSize="small" /></IconButton>
      <Divider />
      <IconButton size="small" onClick={() => map.zoomOut()} aria-label={t('map.zoomOut')}><RemoveIcon fontSize="small" /></IconButton>
    </Paper>
  )
}

function SearchBox({ onSelect, onSelectPlace, me, historyScope }: { onSelect: (f: RecentFountain) => void; onSelectPlace: (p: Place) => void; me: [number, number] | null; historyScope: string }) {
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
  const [searched, setSearched] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  // Si el desplegable está abierto. Vale para las tres cosas que cuelgan del campo
  // —resultados, «sin resultados» e historial— y no solo para el historial: sin esto,
  // tocar el mapa dejaba el panel puesto encima tapando justo lo que ibas a mirar. Ya
  // pasaba con los resultados; el historial lo hizo evidente porque sale con solo
  // enfocar, sin escribir nada.
  const [desplegado, setDesplegado] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const searches = useMemo(() => recentSearches(historyScope), [historyVersion, historyScope])
  const fountains = useMemo(() => recentFountains(historyScope), [historyVersion, historyScope])

  useEffect(() => setAbierto(!compacto), [compacto])

  const [searchIntent, setSearchIntent] = useSearchParams()
  useEffect(() => {
    if (searchIntent.get('search') !== '1') return
    setAbierto(true)
    setDesplegado(true)
    const clean = new URLSearchParams(searchIntent)
    clean.delete('search')
    setSearchIntent(clean, { replace: true })
    if (!compacto) inputRef.current?.focus()
  }, [searchIntent, setSearchIntent, compacto])


  // Cerrar el desplegable al tocar fuera o con Escape. Va en `mousedown` y no en `blur`:
  // el `blur` llega **antes** que el `click` de la lista, así que cerrar ahí impediría
  // elegir con el ratón — es el mismo motivo por el que las sugerencias de menciones usan
  // `onMouseDown`. Solo en escritorio: en móvil el buscador es un diálogo a pantalla
  // completa con su propia aspa.
  useEffect(() => {
    if (compacto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setDesplegado(false)
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setDesplegado(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [compacto])

  // Búsqueda con debounce: fuentes (nuestra API) y lugares (Nominatim/OSM) en paralelo.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setMatches([])
      setPlaces([])
      setSearched(false)
      return
    }
    setSearched(false)
    let active = true
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      trackInteraction('search_run')
      Promise.all([
        apiFetch<Page<Font>>(`/fonts?search=${encodeURIComponent(term)}&per=6`).then((p) => p.items).catch(() => [] as Font[]),
        searchPlaces(term, lang, ctrl.signal),
      ]).then(([fonts, foundPlaces]) => {
        if (!active) return
        setMatches(fonts); setPlaces(foundPlaces)
        setSearched(true)
        if (fonts.length === 0 && foundPlaces.length === 0) trackInteraction('search_no_results')
      })
    }, 350)
    return () => {
      clearTimeout(timer)
      active = false
      ctrl.abort()
    }
  }, [q, lang])

  function clear() {
    setQ('')
    setMatches([])
    setPlaces([])
    setSearched(false)
  }

  function abrir() {
    setHistoryVersion((version) => version + 1)
    setDesplegado(true)
    setAbierto(true)
    // El foco va tras el render, o el teclado no sube en iOS.
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function cerrar() {
    clear()
    setAbierto(false)
  }

  const hasResults = matches.length > 0 || places.length > 0
  const noResults = searched && q.trim().length >= 2 && !hasResults

  const senseResultats = (aPantallaCompleta: boolean) => (
    <Box sx={{ p: aPantallaCompleta ? 3 : 2, textAlign: 'center' }}>
      <Typography sx={{ fontWeight: 700 }}>{t('search.noResultsTitle')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
        {t('search.noResultsBody')}
      </Typography>
      <Button size="small" onClick={clear}>{t('search.clear')}</Button>
    </Box>
  )

  // De qué fuente estamos hablando. Sin esto, buscar «font» devolvía **seis filas
  // seguidas llamadas «A Fonte»** sin nada que las distinga: en un desplegable pequeño se
  // disimulaba, ocupando la pantalla entera es que no se puede elegir.
  //
  // Dice el **municipio** cuando se sabe, y si no la demarcación. El municipio sale de
  // los límites del IGN por point-in-polygon, así que es exacto y no «el pueblo más
  // cercano»; donde no hay fronteras cargadas —fuera de España— sigue siendo la
  // demarcación, que es lo que de verdad hay (y `region` son provincias, distritos o
  // départements según el país: ver «Comarca ≠ provincia»).
  //
  // Y delante la **distancia**, que es lo que responde a «¿a cuál voy?», solo si se sabe
  // dónde estás. Lo que falte simplemente no sale; nada se inventa.
  const donde = (f: RecentFountain) => [
    me ? formatDist(haversineKm(me[0], me[1], f.latitude, f.longitude)) : null,
    f.municipality || f.region,
  ].filter(Boolean).join(' · ')

  // Los resultados, una sola vez. Cambia el tamaño de la fila —48 px para el pulgar en la
  // pantalla completa, compacto con ratón— pero no qué se enseña ni en qué orden.
  const resultados = (aPantallaCompleta: boolean) => (
    <List dense={!aPantallaCompleta} disablePadding>
      {matches.length > 0 && <ListSubheader>💧 {t('search.fountains')}</ListSubheader>}
      {matches.map((f) => (
        <ListItemButton
          key={f.id}
          onClick={() => { trackInteraction('search_font_select'); rememberSearch(q, historyScope); rememberFountain(f, historyScope); onSelect(f); if (compacto) cerrar(); else { clear(); setDesplegado(false) } }}
          sx={aPantallaCompleta ? { minHeight: 56 } : undefined}
        >
          <ListItemText primary={nombreFuente(f, t)} secondary={donde(f) || undefined} />
        </ListItemButton>
      ))}
      {places.length > 0 && <ListSubheader>📍 {t('search.places')}</ListSubheader>}
      {places.map((p, i) => (
        <ListItemButton
          key={`p${i}`}
          onClick={() => { trackInteraction('search_place_select'); rememberSearch(q, historyScope); onSelectPlace(p); if (compacto) cerrar(); else { clear(); setDesplegado(false) } }}
          sx={aPantallaCompleta ? { minHeight: 56 } : undefined}
        >
          <ListItemText primary={p.name} sx={aPantallaCompleta ? undefined : { '& .MuiListItemText-primary': { fontSize: 13 } }} />
        </ListItemButton>
      ))}
    </List>
  )

  // Historial mínimo y local: las búsquedas solo se guardan al elegir algo, nunca
  // mientras se escribe. Las fuentes son datos públicos; no guardamos la ubicación GPS.
  const historial = (aPantallaCompleta: boolean) => (
    <List dense={!aPantallaCompleta} disablePadding>
      <ListSubheader sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>🕘 {t('search.recent')}</span>
        <Button size="small" onClick={() => { clearRecentHistory(historyScope); setHistoryVersion((version) => version + 1) }}>
          {t('search.clearHistory')}
        </Button>
      </ListSubheader>
      {searches.map((term) => (
        <ListItemButton key={`q:${term}`} onClick={() => setQ(term)} sx={aPantallaCompleta ? { minHeight: 48 } : undefined}>
          <ListItemText primary={term} secondary={t('search.recentSearch')} />
        </ListItemButton>
      ))}
      {fountains.length > 0 && <ListSubheader>💧 {t('search.recentFountains')}</ListSubheader>}
      {fountains.map((font) => (
        <ListItemButton
          key={`h:${font.id}`}
          // Se comporta **igual que un resultado de búsqueda**: centra el mapa y abre su
          // globo. Antes navegaba a la ficha, y eso era una incoherencia con la lista de
          // justo encima —dos filas casi idénticas que hacían cosas distintas— y además te
          // sacaba del mapa, que es donde estás. A la ficha se llega desde el globo.
          onClick={() => { rememberFountain(font, historyScope); onSelect(font); setDesplegado(false) }}
          sx={aPantallaCompleta ? { minHeight: 56 } : undefined}
        >
          <ListItemText primary={nombreFuente(font, t)} secondary={donde(font) || undefined} />
        </ListItemButton>
      ))}
    </List>
  )
  const hasHistory = searches.length > 0 || fountains.length > 0

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
            onFocus={() => { setHistoryVersion((v) => v + 1); setDesplegado(true) }}
            onChange={(e) => { setDesplegado(true); setQ(e.target.value) }}
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
            : noResults
              ? senseResultats(true)
            : hasHistory
              ? historial(true)
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
      <Box className="search search--collapsed" data-map-help="search">
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
    <Box className="search" ref={caja} data-map-help="search">
      <Paper elevation={3} sx={{ display: 'flex', alignItems: 'center', px: 1.5, borderRadius: '24px' }}>
        <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
        <InputBase
          inputRef={inputRef}
          value={q}
          onFocus={() => { setHistoryVersion((v) => v + 1); setDesplegado(true) }}
          onChange={(e) => { setDesplegado(true); setQ(e.target.value) }}
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
      {hasResults && desplegado && (
        <Paper elevation={4} sx={{ mt: 0.5, borderRadius: 3, overflow: 'hidden', maxHeight: '50vh', overflowY: 'auto' }}>
          {resultados(false)}
        </Paper>
      )}
      {noResults && desplegado && (
        <Paper elevation={4} sx={{ mt: 0.5, borderRadius: 3 }}>
          {senseResultats(false)}
        </Paper>
      )}
      {!q && hasHistory && desplegado && (
        <Paper elevation={4} sx={{ mt: 0.5, borderRadius: 3, overflow: 'hidden', maxHeight: '50vh', overflowY: 'auto' }}>
          {historial(false)}
        </Paper>
      )}
    </Box>
  )
}

function NewFontForm({ pos, me, onCancel, onCreated }: { pos: LatLng; me: [number, number] | null; onCancel: () => void; onCreated: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const movil = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState<WaterSource | ''>('')
  const [drinkable, setDrinkable] = useState<Drinkable | ''>('')
  const [file, setFile] = useState<File | null>(null)
  // Estado del agua: se puede dejar ya al crear la fuente (quien la añade suele estar
  // delante de ella). Se publica como primera actualización, sin abrir el detalle.
  const [waterStatus, setWaterStatus] = useState('')
  const [error, setError] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const [requestingException, setRequestingException] = useState(false)
  const [exceptionRequested, setExceptionRequested] = useState(false)
  const [saving, setSaving] = useState(false)
  // Ubicación efectiva: el clic del usuario, que la foto puede sugerir cambiar.
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: pos.lat, lng: pos.lng })
  // Punto con el que se abrió el formulario. No cambia al recolocar el pin y permite que
  // «deshacer» tenga un significado estable dentro del mapa móvil.
  const [original] = useState({ lat: pos.lat, lng: pos.lng })
  const [gpsHint, setGpsHint] = useState<GpsCoords | null>(null)
  const meCoords = me ? { lat: me[0], lng: me[1] } : null
  const remote = isRemotePlacement(coords, meCoords)
  const remoteKm = meCoords ? distanceMetres(coords, meCoords) / 1000 : null

  // Cuánto tapa el teclado, publicado como `--kb` mientras este formulario está abierto.
  // El panel flota sobre el mapa y crece hacia arriba; en iOS su parte baja quedaba detrás
  // del teclado sin forma de sacarla. Con esto el panel se levanta y su alto se recorta al
  // hueco visible, así el scroll interno alcanza la descripción y el botón. `visualViewport`
  // es la única medida fiable del teclado; en escritorio no encoge, así que `--kb` = 0.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--kb', `${Math.round(overlap)}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.setProperty('--kb', '0px')
    }
  }, [])

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
    trackInteraction('font_create_start')
    if (file) trackInteraction('font_create_photo')
    setError('')
    setLimitReached(false)
    setSaving(true)
    // Comprimimos antes de nada: así la foto ya está lista tanto para subirla ahora
    // como para guardarla en la cola si resulta que no hay cobertura.
    const preparada = file ? await prepararFoto(file) : undefined
    const photo = preparada?.photo
    let allowNearbyDuplicate = false
    try {
      const nearby = await nearbyFonts(coords.lat, coords.lng, 10)
      // La más cercana de las que están dentro del radio, no una cualquiera: el aviso la
      // NOMBRA, y para eso hay que elegir de cuál se habla.
      const cerca = nearby
        .map((f) => ({ f, km: haversineKm(coords.lat, coords.lng, f.latitude, f.longitude) }))
        .filter((x) => x.km <= 0.025)
        .sort((a, b) => a.km - b.km)[0]
      if (cerca) {
        // Decir «hay una fuente a menos de 25 m» no basta para reconocerla: la que
        // motivó esto estaba a 3 m y **con otro nombre**, así que quien la estaba
        // duplicando no tenía forma de saber que era la misma. Con el nombre y los
        // metros delante, la pregunta se puede contestar.
        const aviso = t('newFont.nearDuplicateNamed', {
          name: nombreFuente(cerca.f, t),
          m: Math.round(cerca.km * 1000),
        })
        if (!confirm(aviso)) { setSaving(false); return }
        allowNearbyDuplicate = true
      }
    } catch {
      // La API repetirá esta comprobación de forma autoritativa al crear.
    }
    const data = {
      name: name.trim() || null,
      latitude: coords.lat,
      longitude: coords.lng,
      description: description || undefined,
      source: source || undefined,
      drinkable: drinkable || undefined,
      allowNearbyDuplicate,
    }
    try {
      const image = photo ? await uploadImage(photo, preparada?.meta) : undefined
      const font = await createFont({ ...data, image })
      trackInteraction('font_create_success')
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
        trackInteraction('font_create_queued')
        toast.show(t('offline.savedFont'))
        onCreated()
      } else {
        trackInteraction('font_create_error')
        setLimitReached(e instanceof ApiError && e.code === 'font.newAccountLimit')
        setError(describeError(e, t))
      }
    } finally {
      setSaving(false)
    }
  }

  const campos = (
    <>
      {movil ? (
        <RelocateFont
          lat={coords.lat}
          lng={coords.lng}
          original={original}
          onChange={(lat, lng) => setCoords({ lat, lng })}
        />
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Lat {coords.lat.toFixed(5)}, Long {coords.lng.toFixed(5)}
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('newFont.tapToMove')}</Typography>
        </>
      )}
        {remote && remoteKm != null && (
          <Alert severity="info">
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {t('newFont.remoteTitle', { distance: remoteKm < 10 ? remoteKm.toFixed(1) : Math.round(remoteKm) })}
            </Typography>
            <Typography variant="body2">{t('newFont.remoteBody')}</Typography>
          </Alert>
        )}
        <TextField label={t('newFont.nameOpt')} value={name} onChange={(e) => setName(e.target.value)} size="small" />
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
          // Al enfocar, y una vez el teclado ha levantado el panel (de ahí el retardo), se
          // sube el campo a la vista dentro del scroll del panel.
          onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350) }}
          size="small" multiline minRows={2} maxRows={4}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TextField select label={t('detail.type')} value={source} onChange={(e) => setSource(e.target.value as WaterSource | '')} size="small" sx={{ flexGrow: 1 }}>
            <MenuItem value="">{t('detail.unknownType')}</MenuItem>
            {SOURCE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{SOURCE_EMOJI[k]} {t(`source.${k}`)}</MenuItem>))}
          </TextField>
          <WaterTypeHelpButton />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TextField select label={t('detail.drinkability')} value={drinkable} onChange={(e) => setDrinkable(e.target.value as Drinkable | '')} size="small" sx={{ flexGrow: 1 }}>
            <MenuItem value="">{t('detail.unknownDrink')}</MenuItem>
            {DRINKABLE_OPTIONS.map((k) => (<MenuItem key={k} value={k}>{DRINKABLE_EMOJI[k]} {t(`drink.${k}`)}</MenuItem>))}
          </TextField>
          <DrinkableHelpButton />
        </Box>
        <ImagePicker file={file} onChange={pickFile} placeholder={movil} />
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
        {error && (
          <Alert severity="error">
            {error}
            {limitReached && (
              <Box sx={{ mt: 1 }}>
                <Button size="small" variant="outlined" color="inherit"
                  disabled={requestingException || exceptionRequested}
                  onClick={async () => {
                    setRequestingException(true)
                    try {
                      await requestSourceLimitExemption()
                      setExceptionRequested(true)
                    } catch (e) {
                      setError(describeError(e, t))
                    } finally { setRequestingException(false) }
                  }}>
                  {exceptionRequested ? t('sourceLimit.requested') : requestingException ? t('sourceLimit.requesting') : t('sourceLimit.request')}
                </Button>
              </Box>
            )}
          </Alert>
        )}
    </>
  )

  const acciones = (
    <>
      <Button
        onClick={onCancel}
        disabled={saving}
        variant={movil ? 'outlined' : 'text'}
        color="inherit"
        sx={{ minHeight: { xs: 48, sm: 36 }, flex: { xs: 1, sm: '0 0 auto' } }}
      >
        {t('form.cancel')}
      </Button>
      <Button
        type="submit"
        variant="contained"
        disableElevation
        disabled={saving}
        sx={{ minHeight: { xs: 48, sm: 36 }, flex: { xs: 1, sm: '0 0 auto' } }}
      >
        {saving ? t('form.saving') : t('form.create')}
      </Button>
    </>
  )

  if (movil) {
    return (
      <Dialog
        fullScreen
        open
        onClose={saving ? undefined : onCancel}
        slotProps={{ paper: { sx: { bgcolor: 'background.default', backgroundImage: 'none' } } }}
      >
        {/* Una pantalla y no un popup: el mapa de ubicación forma parte del formulario,
            el contenido puede desplazarse con el teclado abierto y las acciones quedan
            siempre al alcance del pulgar, por encima del indicador de inicio del iPhone. */}
        <Box component="form" onSubmit={submit} sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
          <Paper
            square
            elevation={0}
            sx={{
              position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center',
              gap: 1, px: 1, pt: 'env(safe-area-inset-top)', borderBottom: 1, borderColor: 'divider',
              bgcolor: 'background.default',
            }}
          >
            <IconButton onClick={onCancel} disabled={saving} aria-label={t('form.cancel')} size="large">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{t('newFont.title')}</Typography>
          </Paper>
          <DialogContent sx={{ flex: 1, px: 2, py: 2, overflowY: 'auto' }}>
            <Stack spacing={2}>{campos}</Stack>
          </DialogContent>
          <Box
            sx={{
              position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', gap: 1,
              px: 2, pt: 1, pb: 'max(12px, env(safe-area-inset-bottom))',
              bgcolor: 'background.default', borderTop: 1, borderColor: 'divider',
            }}
          >
            {acciones}
          </Box>
        </Box>
      </Dialog>
    )
  }

  return (
    <div className="panel">
      <Typography variant="h6">{t('newFont.title')}</Typography>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        {campos}
        <Stack direction="row" spacing={1}>{acciones}</Stack>
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
  // solo la refrescamos al cambiar de "casilla" de ~100 m.
  //
  // **Y se pide con las coordenadas de la casilla, no con las tuyas.** Antes se decidía
  // cuándo pedir por casilla pero se pedía con el GPS crudo, así que cada petición tenía
  // una URL nueva — y el service worker cachea por URL exacta. Resultado: sin cobertura
  // esta lista no acertaba **nunca**. Misma regla que `/activity`, y de paso dos personas
  // en el mismo sitio comparten la respuesta.
  const casilla = casillaDe(pos[0], pos[1])
  useEffect(() => {
    const [lat, long] = posRef.current
    apiFetch<FontSummary[]>(`/fonts/near?lat=${casilla.lat}&long=${casilla.long}&quantity=25`)
      .then(setItems)
      // Sin red, la zona guardada. Se calcula aquí lo mismo que calcula el servidor —
      // ordenar por distancia— porque guardar una respuesta por casilla de 111 m serían
      // miles de peticiones para trocear la misma lista de fuentes.
      .catch(async () => {
        const zona = await zonaGuardada()
        setItems(zona ? cercanasEn(zona, lat, long, 25) : [])
      })
    // Solo la clave: dentro de la misma casilla no hay nada que volver a pedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casilla.clave])

  // El servidor ordena por distancia al centro de la casilla y cada fila pinta la
  // distancia a **ti**, así que sin reordenar aquí podrían salir 210 m encima de 205 m.
  // Es el mismo fallo que ya se arregló en el servidor hace unas horas, y con hasta 100 m
  // de desfase basta para que se vea. Son 25 elementos: ordenar es gratis.
  const ordenados = useMemo(
    () => (items ?? []).slice().sort(
      (a, b) => haversineKm(pos[0], pos[1], a.latitude, a.longitude)
             - haversineKm(pos[0], pos[1], b.latitude, b.longitude),
    ),
    [items, pos],
  )

  const lista = (enHoja: boolean) => (
    <List dense={!enHoja} sx={{ overflowY: 'auto', py: 0 }}>
        {items === null && <ListItem><Typography color="text.secondary">{t('map.loading')}</Typography></ListItem>}
        {ordenados.map((f) => {
          const ws = waterStatusInfo(f.lastWaterStatus)
          const dist = haversineKm(pos[0], pos[1], f.latitude, f.longitude)
          return (
            <ListItem
              key={f.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" component={Link} to={`/fonts/${f.id}`} aria-label={t('nearby.goAria', { name: nombreFuente(f, t) })}>
                  <ArrowForwardIcon />
                </IconButton>
              }
            >
              <ListItemButton selected={f.id === selectedID} onClick={() => onFocus(f)} sx={enHoja ? { minHeight: 56 } : undefined}>
                <ListItemText
                  primary={nombreFuente(f, t)}
                  secondary={
                    <>
                      {ws && <span title={t(`status.${ws.key}`)}>{ws.emoji}</span>} {formatDist(dist)}
                      {f.lastUpdate && ` · ${timeAgo(f.lastUpdate, t)}`}
                      {' '}<ConfidenceChip evidence={f} />
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

// Todos los colores que de verdad salen en el mapa, o la leyenda miente por omisión:
// faltaban el morado (`broken`) y sobre todo el gris (`gone`, «ya no está»), que se
// reportó al no saber qué significaba una fuente gris.
const LEYENDA = ['flowing', 'trickle', 'dry', 'broken', 'gone'] as const

function MapLegend({ density }: { density: boolean }) {
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
          <Typography variant="caption" sx={{ fontWeight: 800 }}>
            {t(density ? 'legend.density' : 'legend.waterStatus')}
          </Typography>
          {density ? (
            <Box sx={{ width: 180 }}>
              <Box sx={{ height: 10, borderRadius: 99, background: 'linear-gradient(90deg, #66bb6a, #fbc02d, #ef5350)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
                <Typography variant="caption">{t('legend.densityLow')}</Typography>
                <Typography variant="caption">{t('legend.densityHigh')}</Typography>
              </Box>
            </Box>
          ) : <>
            {LEYENDA.map((k) => (
              <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13 }}>
                <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: WATER_STATUS[k].color }} /> {t(`status.${k}`)}
              </Box>
            ))}
            {/* Blue represents the many imported fountains that have no status report yet. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13 }}>
              <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: NO_STATUS_COLOR }} /> {t('status.unknown')}
            </Box>
          </>}
        </Paper>
      </Collapse>

      {/* Mismo `Fab` que los demás botones del mapa, y el mismo gesto que el de
          herramientas: el icono pasa a una X cuando está abierto. Antes era un botón a
          medida con cuatro puntos de color dentro y desentonaba con todo lo demás. */}
      <Fab
        size="small"
        onClick={alternar}
        aria-expanded={abierta}
        data-map-help="legend"
        aria-label={t(abierta ? 'legend.hide' : 'legend.show')}
        title={t(abierta ? 'legend.hide' : 'legend.show')}
        sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
      >
        {abierta ? <CloseIcon fontSize="small" /> : <PaletteOutlinedIcon fontSize="small" />}
      </Fab>
    </Box>
  )
}

/** Visits during which the help (?) button is shown on the map itself. */
const HELP_BUTTON_SESSIONS = 10

export function MapPage() {
  const { user, promptLocation, dismissLocationPrompt } = useAuth()
  const { t } = useI18n()
  const [placing, setPlacing] = useState(false)
  /**
   * El temporizador que abre el formulario dos segundos después de caer el pin.
   *
   * En una `ref` y con limpieza al desmontar: si se sale del mapa dentro de esos dos
   * segundos —cambiar de pestaña, tocar una fuente—, el formulario no debe abrirse solo
   * sobre una pantalla que ya no es ésta.
   */
  const relojFormulario = useRef<number | null>(null)
  useEffect(() => () => {
    if (relojFormulario.current !== null) window.clearTimeout(relojFormulario.current)
    if (relojInvita.current !== null) window.clearTimeout(relojInvita.current)
  }, [])
  const [pos, setPos] = useState<LatLng | null>(null)
  const [nonce, setNonce] = useState(0)
  const [me, setMe] = useState<[number, number] | null>(null)
  useEffect(() => {
    if (!me) return
    let alive = true
    void getRain(me[0], me[1])
      .then(({ raining }) => { if (alive) window.dispatchEvent(new CustomEvent('fontapp:rain', { detail: raining })) })
      .catch(() => {})
    return () => { alive = false }
  }, [me && Math.round(me[0] * 10), me && Math.round(me[1] * 10)])
  // Última posición conocida, para pintar un punto atenuado al abrir cuando el permiso ha
  // caducado (iOS). Se siembra del almacén una vez; en cuanto llega `me` en vivo, sobra.
  const [meStale] = useState<[number, number] | null>(() => leeFix())
  const [goto, setGoto] = useState<[number, number] | null>(null)
  // Destino del seguimiento continuo: cambia con cada fix del GPS mientras `siguiendo`.
  // Separado de `goto` a propósito — `goto` enfoca a zoom 16 y esto solo desplaza.
  const [sigueme, setSigueme] = useState<[number, number] | null>(null)
  // Modo navegación (flecha en vez de punto) cuando te mueves rápido, y el rumbo de viaje.
  // `intervaloMs` es la cadencia real de fixes, que marca la duración de la interpolación.
  const [navegando, setNavegando] = useState(false)
  const [curso, setCurso] = useState<number | null>(null)
  const [intervaloMs, setIntervaloMs] = useState(1000)
  // Destino de «centrar en mí» (una vez, conservando el zoom). Separado de `goto` (que
  // enfoca a zoom 16) y de `sigueme` (seguimiento continuo).
  const [centrame, setCentrame] = useState<[number, number] | null>(null)
  // Marca los movimientos que hacemos nosotros (FocusOn, seguir, centrar en mí) para que
  // no se confundan con un gesto del usuario. Ver `DetectaGestoDelUsuario`.
  const movimientoNuestro = useRef(false)
  const [geoError, setGeoError] = useState('')
  // Los tres arrancan de lo último elegido en esta sesión, igual que la vista del mapa.
  // `down('sm')` y no un ancho a mano: es el mismo corte que usan la tab bar, el pie y
  // los controles de la cabecera, así que la app entera cambia de forma a la vez.
  const movil = useMediaQuery((tema: Theme) => tema.breakpoints.down('sm'))
  const [filtrosGuardados] = useState(loadFilters)
  const [onlyWithWater, setOnlyWithWater] = useState(filtrosGuardados.onlyWithWater)
  const [onlyReliable, setOnlyReliable] = useState(filtrosGuardados.onlyReliable)
  const [hideNonPotable, setHideNonPotable] = useState(filtrosGuardados.hideNonPotable)
  const [sourceFilter, setSourceFilter] = useState<WaterSource | 'all'>(filtrosGuardados.source)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [gpxOpen, setGpxOpen] = useState(false)
  const [zonaOpen, setZonaOpen] = useState(false)
  // En escritorio los flotantes de GPX y «sin conexión» salen a la izquierda de su botón,
  // como el panel de filtros, en vez de caer debajo de la columna. Se anclan al Fab.
  const gpxBtn = useRef<HTMLButtonElement>(null)
  const zonaBtn = useRef<HTMLButtonElement>(null)
  const [densityVisible, setDensityVisible] = useState(false)
  const { layer, setLayer } = useBaseLayer()
  // Instancia del mapa: hace falta fuera del lienzo para el botón de la brújula.
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [bearing, setBearing] = useState(0)
  const { heading, enable: enableCompass } = useHeading()
  // Nº de filtros activos (para el aviso cuando las herramientas están plegadas).
  const activeFilters = (onlyWithWater ? 1 : 0) + (onlyReliable ? 1 : 0) + (hideNonPotable ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0)

  // Al cambiar cualquiera, se recuerda. Es lo que hace que volver del detalle no
  // repueble el mapa con lo que acababas de esconder.
  useEffect(() => {
    saveFilters({ onlyWithWater, onlyReliable, hideNonPotable, source: sourceFilter })
  }, [onlyWithWater, onlyReliable, hideNonPotable, sourceFilter])
  const [showNearby, setShowNearby] = useState(false)
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [missionsOpen, setMissionsOpen] = useState(false)
  // Help overlay ("what does each button do"). The (?) button sits on the map only for
  // the first HELP_BUTTON_SESSIONS visits; after that it lives in the ⋮ menu, which opens
  // it through `?help=1`. Read once per mount: sesiones() is stable within a session.
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpButton] = useState(() => sesiones() <= HELP_BUTTON_SESSIONS)
  const [wish, setWish] = useState(0)
  const wishTimer = useRef<number | null>(null)
  const wishConsumed = useRef(false)
  useEffect(() => () => { if (wishTimer.current !== null) window.clearTimeout(wishTimer.current) }, [])
  const [place, setPlace] = useState<Place | null>(null)
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('help') !== '1') return
    setHelpOpen(true)
    trackInteraction('map_help')
    const clean = new URLSearchParams(params)
    clean.delete('help')
    setParams(clean, { replace: true })
  }, [params, setParams])
  const navigate = useNavigate()
  const empiezaDeseo = () => {
    wishConsumed.current = false
    wishTimer.current = window.setTimeout(() => {
      wishTimer.current = null
      wishConsumed.current = true
      setWish((n) => n + 1)
      navigator.vibrate?.(25)
    }, 850)
  }
  const cancelaDeseo = () => {
    if (wishTimer.current !== null) window.clearTimeout(wishTimer.current)
    wishTimer.current = null
  }
  // La invitación a crear cuenta tras una pulsación larga sin sesión. El reloj vive en una
  // `ref` y se limpia al desmontar, por lo mismo que el del formulario: salir del mapa
  // dentro de esos segundos no debe tocar el estado de una pantalla que ya no está.
  const [invita, setInvita] = useState(false)
  const relojInvita = useRef<number | null>(null)
  // Vista inicial: la última guardada (al volver del detalle) o la península por defecto.
  // Al montar: la vista de esta sesión si la hay y, si no, la última conocida. Solo la
  // primera desactiva la ubicación automática (ver el comentario de VIEW_KEY).
  const [initialView] = useState(() => {
    const { sesion, ultima } = guardado()
    return vistaAlAbrir(sesion, ultima).vista
  })

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

  // Añadir fuente: cerca de la persona manda el GPS (el camino presencial). Si ha
  // buscado o desplazado el mapa más de 250 m, manda el centro visible: devolver el pin
  // silenciosamente a casa convierte una búsqueda correcta en una fuente mal situada.
  function startPlacing() {
    setPlacing(true)
    const center = map?.getCenter()
    if (!center) { setPos(null); return }
    const chosen = newFontPosition(
      { lat: center.lat, lng: center.lng },
      me ? { lat: me[0], lng: me[1] } : null,
    )
    setPos(L.latLng(chosen.lat, chosen.lng))
    if (me && chosen.lat === me[0] && chosen.lng === me[1]) setGoto([me[0], me[1]])
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
  // Espejos en ref de lo que decide el modo navegación dentro del callback del GPS, para
  // no leer estado obsoleto ni re-renderizar por cada tick. `horaFix` mide la cadencia.
  const navRef = useRef(false)
  const cursoRef = useRef<number | null>(null)
  const horaFix = useRef(0)
  // ¿El mapa va detrás de ti? Deja de hacerlo en cuanto tocas el mapa: a partir de
  // ahí estás mirando otra zona y que el mapa te devuelva a tu posición cada pocos
  // segundos sería insufrible. El botón de "centrar en mí" lo vuelve a activar.
  const [modo, setModo] = useState<ModoUbicacion>(MODO_INICIAL)
  const modoRef = useRef<ModoUbicacion>(MODO_INICIAL)
  modoRef.current = modo
  // ¿El mapa se mueve solo detrás de ti? Lo lee `FontMarkers` para no inundar de
  // peticiones al seguir (sobre todo en navegación). Ver su antiavalancha.
  const siguiendoRef = useRef(false)
  siguiendoRef.current = sigueUbicacion(modo)

  const startWatching = useCallback(() => {
    if (watchID.current !== null || !navigator.geolocation) return
    seguimiento.current = true
    watchID.current = navigator.geolocation.watchPosition(
      (p) => {
        const c: [number, number] = [p.coords.latitude, p.coords.longitude]
        const anterior = ultimaPos.current
        const distM = anterior ? haversineKm(anterior[0], anterior[1], c[0], c[1]) * 1000 : 0

        // ── Modo navegación (flecha vs punto), barato y en CADA tick, para que reaccione
        // al frenar aunque el punto no se mueva 15 m. La velocidad manda la del GPS; el
        // rumbo sale del propio desplazamiento (no necesita brújula). Ver `lib/navMode`.
        const dt = horaFix.current ? (p.timestamp - horaFix.current) / 1000 : 0
        const vel = velocidadMs(p.coords.speed, distM, dt)
        const rumbo = anterior ? rumboEntre(anterior, c) : null
        if (rumbo != null) {
          cursoRef.current = rumbo
          // Solo repinta si el rumbo cambia de verdad (≥3°), para no re-renderizar por ruido.
          setCurso((prev) => (prev == null || Math.abs(((rumbo - prev + 540) % 360) - 180) >= 3) ? rumbo : prev)
        }
        const nav = decideNavegando(vel, cursoRef.current, navRef.current)
        if (nav !== navRef.current) { navRef.current = nav; setNavegando(nav) }

        // El GPS "baila" unos metros estando quieto. Sin este filtro el punto
        // temblaría y la lista de cercanas se recargaría sin haberte movido.
        if (anterior && distM < 15) return
        // Intervalo real entre fixes: es la duración de la interpolación en modo navegación.
        if (horaFix.current) setIntervaloMs(Math.min(3000, Math.max(400, p.timestamp - horaFix.current)))
        horaFix.current = p.timestamp
        ultimaPos.current = c
        setMe(c)
        guardaFix(c) // recordamos la última posición para el punto atenuado del próximo arranque
        // Mientras no toques el mapa, va detrás de ti — desplazando, SIN cambiar tu
        // zoom (por eso `sigueme` y no `goto`, que enfoca a zoom 16). La comparación va
        // contra una ref y no dentro del actualizador de `setMe`: encadenar ahí es una
        // actualización en fase de render y React la descarta sin avisar.
        // En navegación NO se usa `sigueme`: el marcador de navegación arrastra el mapa
        // con la posición ya suavizada, y dos seguimientos a la vez se pisan.
        if (sigueUbicacion(modoRef.current) && !navRef.current) setSigueme([...c])
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
    const onOk = (p: GeolocationPosition) => {
      const c: [number, number] = [p.coords.latitude, p.coords.longitude]
      setMe(c)
      guardaFix(c)
      // 'follow' se marca AQUÍ, con la posición ya en la mano — no al pulsar. Ponerlo
      // antes dejaba el botón en estado 2 sin punto azul mientras el GPS respondía, y si
      // fallaba se quedaba «siguiendo» a nadie. Con la posición, engancha y endereza.
      setModo('follow')
      map?.setBearing(0)
      setCentrame([...c])   // centrar en mí conservando tu zoom (no fuerza 16)
      if (openList) setShowNearby(true)
      startWatching()   // ya hay permiso: a partir de ahora se actualiza sola
    }

    // 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
    navigator.geolocation.getCurrentPosition(
      onOk,
      (err) => {
        // Permiso denegado: no reintentamos, pero distinguimos «bloqueado de verdad»
        // (ir a ajustes) de «caducado / cerrado el diálogo» (reintentar). En iOS el
        // permiso caduca cada 24 h y esto último es lo normal. Ver `geoNotice`.
        if (err.code === err.PERMISSION_DENIED) {
          navigator.permissions?.query({ name: 'geolocation' })
            .then((e) => setGeoError(t(claveAvisoTrasDenegar(e.state as EstadoPermiso))))
            .catch(() => setGeoError(t('map.geoDismissed'))) // sin API de permisos: no asustar
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

  // El botón de ubicación cicla como en Mapas de iOS: off -> follow -> heading -> follow.
  // De 'off' a 'follow' lo hace `locate` (centra + engancha). De 'follow' a 'heading'
  // enciende la brújula —el sensor de iOS EXIGE que la petición salga de este toque— y
  // deja que el efecto de abajo gire el mapa. De 'heading' se vuelve a 'follow' y se
  // endereza el norte. Para salir del todo ('off') se mueve el mapa, como en iOS.
  function ciclaUbicacion() {
    trackInteraction('map_locate')
    if (modo === 'off') { locate(false); return }  // locate centra y deja 'follow'
    // Ya ubicado: **recentra siempre en ti**, además de ciclar el modo. Antes solo
    // recentraba el paso `off → follow` (dentro de `locate`); los pasos `follow → heading`
    // y `heading → follow` cambiaban la orientación pero no movían el mapa. Si el mapa no
    // había vuelto a `off` al moverlo —en escritorio, un zoom con rueda/trackpad puede
    // quedar marcado como movimiento nuestro por una carrera con el seguimiento del GPS, y
    // entonces no se cuenta como gesto—, el segundo toque ciclaba a «rumbo» sin recentrar y
    // parecía que el botón no ubicaba (reportado en escritorio; en móvil el arrastre
    // siempre resetea a `off`). Recentrar en cada toque es además lo que se espera del
    // botón, como en Apple Maps.
    if (me) setCentrame([...me])
    const siguiente = modoTrasToque(modo)
    setModo(siguiente)
    // Entrar en rumbo enciende el sensor (iOS lo exige desde este toque); salir de rumbo
    // endereza el norte, o el efecto de abajo lo volvería a girar al instante.
    if (siguiente === 'heading') void enableCompass()
    else map?.setBearing(0)
  }

  // Modo 'heading' (rumbo arriba): el mapa gira para que tu rumbo quede arriba. Se pone
  // `bearing = heading` porque el cono del punto azul se pinta a `heading - bearing`, así
  // que con esa igualdad apunta recto hacia arriba y el mapa queda orientado a tu marcha.
  useEffect(() => {
    if (!orientaAlRumbo(modo) || heading === null) return
    map?.setBearing(bearingRumboArriba(heading))
  }, [modo, heading, map])

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
      : { ...chipSx(activo), width: '100%', justifyContent: 'flex-start', '& .MuiChip-label': { flexGrow: 1, textAlign: 'left' } })
    return (
      <>
        {/* Cuenta aparte del FAB de «centrar en mí» (`map_locate`), que hace media cosa:
            centra sin abrir la lista. Mezclarlos impediría leer lo único que se quiere
            saber aquí — si esta lista, escondida dentro de «Filtros», la usa alguien. */}
        <Chip clickable variant="outlined" icon={<MyLocationIcon />} label={noEmoji(t('map.near'))}
              onClick={() => { trackInteraction('map_nearby'); locate(true); if (enHoja) setControlsOpen(false) }} sx={sxChip(false)} />
        <Chip
          clickable
          variant={onlyReliable ? 'filled' : 'outlined'}
          color={enHoja && onlyReliable ? 'primary' : undefined}
          icon={<VerifiedIcon />}
          label={noEmoji(t('map.onlyReliable'))}
          onClick={() => setOnlyReliable((v) => !v)}
          sx={sxChip(onlyReliable)}
        />
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
          variant={hideNonPotable ? 'filled' : 'outlined'}
          color={enHoja && hideNonPotable ? 'primary' : undefined}
          icon={<DoNotDisturbAltIcon />}
          label={noEmoji(t('map.hideNonPotable'))}
          onClick={() => setHideNonPotable((v) => !v)}
          title={t('map.hideNonPotableTitle')}
          sx={sxChip(hideNonPotable)}
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
                width: '100%',
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
        center={initialView ? [initialView.lat, initialView.lng] : DEFAULT_CENTER}
        zoom={initialView?.zoom ?? DEFAULT_ZOOM}
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
        <FontMarkers
          nonce={nonce}
          onlyWithWater={onlyWithWater}
          onlyReliable={onlyReliable}
          hideNonPotable={hideNonPotable}
          sourceFilter={sourceFilter}
          selectedID={selectedID}
          siguiendoRef={siguiendoRef}
          onDensityModeChange={setDensityVisible}
        />
        <PersistView />
        <FocusOn target={goto} marca={movimientoNuestro} />
        <CentraEnMi target={centrame} marca={movimientoNuestro} />
        <SigueAlUsuario pos={sigueme} marca={movimientoNuestro} />
        <DetectaGestoDelUsuario onGesto={() => setModo(MODO_TRAS_GESTO)} marca={movimientoNuestro} />
        <FlyToPlace place={place} />
        <ZoomControls />
        <VigilaGiro onChange={setBearing} />
        {me
          ? (navegando
              ? <MeMarkerNav target={me} curso={curso} bearing={bearing} rumboArriba={orientaAlRumbo(modo)} intervaloMs={intervaloMs} follow={sigueUbicacion(modo)} />
              : <MeMarker pos={me} heading={heading} bearing={bearing} rumboArriba={orientaAlRumbo(modo)} />)
          : meStale && <MeMarker pos={meStale} heading={null} bearing={bearing} atenuado />}
        {placing && <PlacePicker onPick={setPos} />}
        <AsomaElPin pos={pos} activo={placing} />
        {/* Añadir con una pulsación larga. **También sin sesión**: el gesto es deliberado
            —medio segundo sin moverse— y no responder nada es el mismo error que tenía el
            botón, que la app sabe lo que quieres hacer y se calla. Lo que NO se hace es
            abrir el login: eso te saca del mapa por un gesto que puede ser un roce. Cae el
            pin, se dice qué falta y se ofrece crear la cuenta, sin moverte de sitio.
            Solo cuando no se está colocando ya: durante la colocación el mapa responde al
            toque simple, y dos gestos para lo mismo se estorban. */}
        {!placing && (
          <LongPressToAdd
            onAdd={(punto) => {
              if (!user) {
                trackInteraction('map_long_press_signed_out')
                // El pin cae igual: enseña DÓNDE habría quedado, que es la mitad de lo
                // que se acaba de pedir. Sin él la invitación no se entiende.
                setPos(punto)
                setInvita(true)
                if (relojInvita.current !== null) window.clearTimeout(relojInvita.current)
                relojInvita.current = window.setTimeout(() => {
                  relojInvita.current = null
                  setInvita(false)
                  setPos(null)
                }, INVITACION_MS)
                return
              }
              // Separado del botón a propósito: son dos intenciones distintas y hasta hoy
              // compartían evento, así que las 84 pulsaciones registradas mezclan las dos
              // y no se puede leer por qué solo 19 acaban en alta. `map_add_font` sigue
              // aceptándose porque las apps instaladas lo seguirán mandando unos días.
              trackInteraction('map_add_font_long_press')
              // El pin primero y solo. El formulario llega después: ver
              // `ESPERA_ANTES_DEL_FORMULARIO_MS`.
              setPos(punto)
              if (relojFormulario.current !== null) window.clearTimeout(relojFormulario.current)
              relojFormulario.current = window.setTimeout(() => {
                relojFormulario.current = null
                setPlacing(true)
              }, ESPERA_ANTES_DEL_FORMULARIO_MS)
            }}
          />
        )}
        {/* Mientras se está creando no es todavía una fuente ni tiene estado. Un marcador
            propio evita perderlo entre los pines azules y no confunde el morado temporal
            con verde/ámbar/rojo, que sí tienen significado en el mapa. */}
        {pos && <Marker position={pos} icon={placing ? placementIcon() : statusIcon(null)} zIndexOffset={placing ? 1000 : 0} />}
      </MapContainer>

      <SearchBox me={me} historyScope={user?.id ?? 'anonymous'} onSelect={(f) => { setGoto([f.latitude, f.longitude]); setSelectedID(f.id) }} onSelectPlace={setPlace} />

      <div className="map-controls">
        {/* Botón que despliega/esconde las herramientas. El puntito avisa si hay
            filtros activos mientras están plegadas, para no ocultarlo en silencio. */}
        <Badge color="primary" variant="dot" invisible={controlsOpen || activeFilters === 0} overlap="circular">
          <Fab
            size="medium"
            onClick={() => {
              trackInteraction('map_filters')
              setGpxOpen(false)
              setZonaOpen(false)
              setControlsOpen((v) => !v)
            }}
            data-map-help="tools"
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
          onClick={() => { trackInteraction('map_missions'); setMissionsOpen(true) }}
          data-map-help="missions"
          aria-label={t('mission.title')}
          title={t('mission.title')}
          sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
        >
          <RouteOutlinedIcon />
        </Fab>
        {/* GPX aparte, y no dentro de las herramientas donde estaba.
            El motivo no es que la columna tuviera sitio: es que en móvil esa hoja se
            titula **«Filtros»**, y meter ahí «descargar las fuentes» y «agua en mi ruta»
            es guardarlas en un cajón cuyo rótulo dice que son otra cosa. Nadie las
            encontraría, y quien las encontrara no sabría por qué estaban ahí.
            El acceso explica el beneficio; el formato GPX se explica dentro de la hoja. */}
        <NuevoBadge clave="gpx">
          <Fab
            ref={gpxBtn}
            size="medium"
            onClick={() => {
              trackInteraction('map_gpx')
              setControlsOpen(false)
              setZonaOpen(false)
              setGpxOpen((v) => !v)
            }}
            data-map-help="gpx"
            aria-label={`${t('gpxIn.title')} · GPX`}
            title={`${t('gpxIn.title')} · GPX`}
            sx={{ bgcolor: 'background.paper', color: 'primary.main', fontWeight: 800, fontSize: 13,
                  letterSpacing: 0.5, '&:hover': { bgcolor: 'background.paper' } }}
          >
            GPX
          </Fab>
        </NuevoBadge>
        {/* Guardar la zona para andar sin cobertura.
            Es un quinto botón en una columna que ya iba justa, y se paga a sabiendas: no
            cabía en ninguna de las hojas que hay. En «Filtros» sería el mismo error que ya
            se cometió metiendo el GPX ahí —un cajón cuyo rótulo dice que son otra cosa— y
            en la de GPX tampoco, porque el botón dice «GPX» con letras y esto no lo es. */}
        <Fab
          ref={zonaBtn}
          size="medium"
          onClick={() => {
            trackInteraction('map_offline')
            setControlsOpen(false)
            setGpxOpen(false)
            setZonaOpen((v) => !v)
          }}
          data-map-help="offline"
          aria-label={t('zonaOff.title')}
          title={t('zonaOff.title')}
          sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
        >
          <CloudDownloadIcon />
        </Fab>
      </div>
      {/* En escritorio, GPX y «sin conexión» salen a la IZQUIERDA de su botón (como el
          panel de filtros), no cayendo debajo de la columna. Se anclan al Fab con un
          Popover: la esquina superior derecha del panel se coloca en la superior izquierda
          del botón, así queda a su lado y alineado con él sin cálculos de píxeles. */}
      {!movil && (
        <Popover
          open={zonaOpen}
          anchorEl={zonaBtn.current}
          onClose={() => setZonaOpen(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { ml: '-10px', width: 260, p: 1.5, borderRadius: 2 } } }}
        >
          {map && <ZonaOfflineSheet map={map} onClose={() => setZonaOpen(false)} />}
        </Popover>
      )}
      {!movil && (
        <Popover
          open={gpxOpen}
          anchorEl={gpxBtn.current}
          onClose={() => setGpxOpen(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { ml: '-10px', width: 280, p: 1.25, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: '10px' } } }}
        >
          <SavedOuting />
          <Typography variant="body2" color="text.secondary">{t('gpxIn.intro')}</Typography>
          <Button component={Link} to="/gpx" variant="contained" startIcon={<UploadIcon />}
                  onClick={() => setGpxOpen(false)}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start', minHeight: 48 }} fullWidth>
            {t('gpxIn.pick')}
          </Button>
          <ExportGpxButton map={map} />
        </Popover>
      )}
      {/* Desktop filters have their own bounded surface. Growing the controls column
          pushed these chips into the compass and location actions on shorter windows. */}
      {!movil && (
        <Collapse in={controlsOpen} className="map-filter-panel">
          <Paper elevation={4} sx={{ width: 250, p: 1.25, maxHeight: 'calc(100dvh - var(--alto-barra) - 150px)', overflowY: 'auto' }}>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>{t('map.filters')}</Typography>
            <Stack spacing={1}>{filtros('escritorio')}</Stack>
          </Paper>
        </Collapse>
      )}
      {movil && (
        <BottomSheet open={controlsOpen} onClose={() => setControlsOpen(false)} titulo={t('map.filters')}>
          <Stack spacing={1.25}>{filtros('movil')}</Stack>
        </BottomSheet>
      )}
      {movil && map && (
        <BottomSheet open={zonaOpen} onClose={() => setZonaOpen(false)} titulo={t('zonaOff.title')}>
          <ZonaOfflineSheet map={map} onClose={() => setZonaOpen(false)} />
        </BottomSheet>
      )}
      {movil && (
        <BottomSheet open={gpxOpen} onClose={() => setGpxOpen(false)} titulo={`${t('gpxIn.title')} · GPX`}>
          <Stack spacing={1.25}>
            <SavedOuting />
          <Typography variant="body2" color="text.secondary">{t('gpxIn.intro')}</Typography>
            <Button component={Link} to="/gpx" variant="contained" startIcon={<UploadIcon />}
                    onClick={() => setGpxOpen(false)}
                    sx={{ textTransform: 'none', justifyContent: 'flex-start', minHeight: 48 }} fullWidth>
              {t('gpxIn.pick')}
            </Button>
            <ExportGpxButton map={map} />
            {/* Dice para qué sirve: «GPX» a secas no lo entiende quien no lleva GPS, y
                quien sí lo lleva es exactamente a quien hay que hablarle. */}
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
              {t('gpx.hint')}
            </Typography>
          </Stack>
        </BottomSheet>
      )}
      {geoError && <div className="hint hint-error">{geoError}</div>}

      <MapLegend density={densityVisible} />

      {showNearby && me && (
        <NearbyPanel pos={me} onClose={() => setShowNearby(false)} onFocus={focusFont} selectedID={selectedID} />
      )}

      {!placing && (
        <div className="map-fabs">
          {/* On desktop the ⋮ menu is not rendered, so there the button is the only way in
              and always stays; there is room for it. */}
          {(helpButton || !movil) && (
            <Fab
              size="small"
              onClick={() => { trackInteraction('map_help'); setHelpOpen(true) }}
              aria-label={t('mapHelp.title')}
              title={t('mapHelp.title')}
              sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
            >
              <HelpOutlineIcon fontSize="small" />
            </Fab>
          )}
          <Compass
            bearing={bearing}
            // Siempre visible en escritorio: allí no hay gesto de dos dedos, así que es la
            // ÚNICA forma de girar el mapa. En móvil, solo cuando ya está girado.
            siempre={!movil}
            // Arrastrarla gira el mapa (como Mapas del Mac). En 'heading' no se ofrece: el
            // efecto de rumbo manda sobre el giro y pelearían.
            onRotate={modo === 'heading' ? undefined : (deg) => map?.setBearing(deg)}
            onReset={() => {
              // Enderezar el norte sale de 'heading': si no, el efecto de rumbo lo
              // volvería a girar al instante. Queda siguiendo tu posición, norte arriba.
              if (modo === 'heading') setModo('follow')
              map?.setBearing(0)
              // Aprovechamos el gesto para pedirle a iOS el sensor de orientación.
              void enableCompass()
            }}
          />
          {(() => {
            // El estado que se PINTA baja a 'off' si aún no hay punto azul: nunca un icono
            // relleno (te sigue) sin nada a lo que seguir. Ver `modoVisible`.
            const visible = modoVisible(modo, me !== null)
            return (
          <Fab size="medium" onClick={ciclaUbicacion} data-map-help="locate" title={t('map.recenter')} aria-label={t('map.recenter')}
               sx={{ bgcolor: botonRelleno(visible) ? 'primary.main' : 'background.paper', color: botonRelleno(visible) ? 'primary.contrastText' : 'primary.main', '&:hover': { bgcolor: botonRelleno(visible) ? 'primary.main' : 'background.paper' } }}>
            {/* Hueca (libre) · rellena (te sigue) · navegación (rumbo arriba), como iOS. */}
            {{ hollow: <NearMeOutlinedIcon />, filled: <NearMeIcon />, navigation: <NavigationIcon /> }[iconoDeModo(visible)]}
          </Fab>
            )
          })()}
          {/* ## Se pinta SIEMPRE, también sin sesión
              Estaba detrás de `user &&`, así que sin sesión no salía nada: ni el botón ni
              una explicación. Medido: **438 sesiones anónimas contra 48 cuentas**, o sea
              que la acción principal de la app era invisible para nueve de cada diez
              visitas — incluida la de quien escanea el QR de un cartel, ve que falta la
              fuente de su plaza y no tiene forma de enterarse de que eso se puede hacer.

              La regla ya estaba escrita en dos sitios y a este botón no se le aplicó: los
              chips de reseña de la lista del GPX se dicen sin sesión «en vez de no pintar
              nada», y en la tab bar «una pestaña que da 401 no es una pestaña».

              Sin sesión lleva a entrar, exactamente como hace «Yo». La **pulsación larga
              se queda detrás de `user`**: un gesto oculto que te saca a una pantalla de
              acceso es peor que no tenerlo, y encima puede dispararse sin querer. */}
          <Fab variant="extended" color="primary" data-map-help="add"
               // Safari/iOS convierte una pulsación larga en selección o menú contextual
               // y puede cancelar pointerup. Touch lleva su carril propio; pointer queda
               // para ratón/lápiz y no se arma dos veces con el mismo dedo.
               onTouchStart={empiezaDeseo}
               onTouchEnd={cancelaDeseo}
               onTouchCancel={cancelaDeseo}
               onPointerDown={(e) => { if (e.pointerType !== 'touch') empiezaDeseo() }}
               onPointerUp={(e) => { if (e.pointerType !== 'touch') cancelaDeseo() }}
               onPointerCancel={(e) => { if (e.pointerType !== 'touch') cancelaDeseo() }}
               onPointerLeave={(e) => { if (e.pointerType !== 'touch') cancelaDeseo() }}
               onContextMenu={(e) => e.preventDefault()}
               onClick={() => {
                 if (wishConsumed.current) { wishConsumed.current = false; return }
                 trackInteraction(user ? 'map_add_font_button' : 'map_add_font_signed_out')
                 if (!user) { navigate(loginNext()); return }
                 startPlacing()
               }}
               sx={{ WebkitTouchCallout: 'none', userSelect: 'none', touchAction: 'manipulation' }}>
            <AddIcon sx={{ mr: 1 }} /> {noEmoji(t('map.addFont'))}
          </Fab>
        </div>
      )}
      <MapHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      {invita && (
        <div className="hint">
          {t('map.signUpToAdd')} · <button className="link" onClick={() => navigate('/register')}>{t('login.register')}</button>
        </div>
      )}
      {placing && !pos && (
        <div className="hint">
          {t('map.tapToPlace')} · <button className="link" onClick={cancel}>{t('map.cancel')}</button>
        </div>
      )}
      {placing && pos && <NewFontForm pos={pos} me={me} onCancel={cancel} onCreated={created} />}

      {/* El punto de partida es donde está el usuario si el mapa ya lo sabe; si no, el
          panel lo pide él (y solo en silencio si el permiso ya estaba dado). */}
      <MissionsPanel
        open={missionsOpen}
        onClose={() => setMissionsOpen(false)}
        center={me}
        onFocus={(target) => { setGoto([target.latitude, target.longitude]); setSelectedID(target.id) }}
      />
      <MapEasterEggs map={map} wish={wish} />
    </div>
  )
}
