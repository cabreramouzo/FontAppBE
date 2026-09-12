import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { MapContainer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { useTheme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import type { LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BaseLayerTile } from './BaseLayers'
import { MAP_LAYERS } from '../lib/mapLayers'
import { coordenadaEnKm, kilometrajes, type PuntoRuta } from '../lib/gpxImport'
import { kmSeñalado, suscribe } from '../lib/routeScrub'
import { useI18n } from '../i18n/I18nContext'

/** Alto del mapa en modo normal (px). Ampliado ocupa toda la pantalla. */
const ALTO = 320

/**
 * Reencuadra al montar y cada vez que cambia el tamaño (ampliar/reducir).
 *
 * Leaflet lee el tamaño del contenedor al crearse, y este mapa nace **dentro de un bloque
 * que acaba de aparecer** (se revela con un botón y se carga con `lazy`): a veces mide el
 * contenedor antes de que el layout se asiente y el mapa «se queda pequeño» —teselas a un
 * zoom que no cubre la vista—. `invalidateSize` lo obliga a remedirse y `fitBounds` vuelve
 * a enmarcar la ruta al tamaño real. Es el mismo arreglo que el mapa del municipio.
 *
 * Va con `setTimeout` y no `requestAnimationFrame`: el navegador congela los fotogramas
 * con la pestaña oculta, y ahí el reencuadre no llegaría a ocurrir.
 */
function Encuadre({ bounds, ampliado }: { bounds: [LatLngTuple, LatLngTuple]; ampliado: boolean }) {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => {
      map.invalidateSize()
      map.fitBounds(bounds, { padding: [24, 24] })
    }, 150)
    return () => clearTimeout(id)
  }, [map, bounds, ampliado])
  return null
}

/**
 * El recorrido y sus fuentes sobre el mapa.
 *
 * ## Se carga a demanda, y por eso es un fichero aparte
 *
 * Leaflet y sus capas pesan del orden de 300 KB, treinta veces lo que ocupa la página
 * entera. Esta pantalla se abre casi siempre en casa, preparando la ruta, así que ese peso
 * no es un veto — pero tampoco hay ninguna razón para que lo pague quien solo quiere ver
 * la lista y el perfil. Se importa con `lazy()` desde un botón: quien lo pide, lo carga.
 *
 * ## Se puede ampliar a pantalla completa
 *
 * En modo normal mide 320 px, que basta para «¿es mi ruta?» y «¿de qué lado cae la
 * fuente?». Pero a veces se queda corto —un recorrido largo o con lazos se ve diminuto—,
 * así que un botón lo lleva a pantalla completa y otro lo devuelve. Al cambiar de tamaño
 * hay que reencuadrar (ver `Encuadre`): Leaflet no se entera solo de que el contenedor ha
 * crecido.
 *
 * ## Qué contesta y qué no
 *
 * Contesta dos preguntas que ni la lista ni el perfil pueden: **si has subido el fichero
 * correcto** —se ve de un vistazo si es tu ruta— y **de qué lado del camino** cae cada
 * fuente, que «a 167 m del trazado» no dice.
 *
 * Lo que **no** contesta bien es dónde está el tramo largo sin agua: en un plano una ruta
 * con lazos es un garabato y dos fuentes pegadas pueden estar a 20 km la una de la otra
 * sobre el recorrido. Para eso están la frase del tramo seco y el perfil, que van arriba.
 */
export function RouteMap({ ruta, fuentes }: {
  ruta: PuntoRuta[]
  fuentes: { lat: number; lon: number; nombre: string; kmRuta: number }[]
}) {
  const tema = useTheme()
  const { t } = useI18n()
  const [ampliado, setAmpliado] = useState(false)
  const linea = useMemo<LatLngTuple[]>(() => ruta.map((p) => [p.lat, p.lon]), [ruta])
  const kms = useMemo(() => kilometrajes(ruta), [ruta])

  // Solo ESTE componente se repinta al mover el dedo por el perfil. Con el kilómetro en
  // el estado de la página se repintaría también la lista de fuentes, que son más de cien
  // filas con sus chips, decenas de veces por segundo.
  const km = useSyncExternalStore(suscribe, kmSeñalado, () => null)
  const señal = km === null ? null : coordenadaEnKm(ruta, kms, km)

  // El encuadre sale del propio recorrido: no hay «centro» que valga para una ruta.
  const bounds = useMemo<[LatLngTuple, LatLngTuple]>(() => {
    const lats = ruta.map((p) => p.lat)
    const lons = ruta.map((p) => p.lon)
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]]
  }, [ruta])

  // Con Escape se sale de pantalla completa, como cualquier visor a pantalla completa.
  useEffect(() => {
    if (!ampliado) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ampliado])

  if (ruta.length < 2) return null

  return (
    <Box
      sx={ampliado
        ? { position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'background.default' }
        : { position: 'relative', height: ALTO, borderRadius: 3, overflow: 'hidden' }}
    >
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        {/* La capa por defecto, sin selector: aquí se viene a mirar la ruta, no a elegir
            cartografía. Quien quiera la ortofoto tiene el mapa de verdad. */}
        <BaseLayerTile layer={MAP_LAYERS[0]} />
        <Encuadre bounds={bounds} ampliado={ampliado} />
        <Polyline positions={linea} pathOptions={{ color: tema.palette.primary.main, weight: 4, opacity: 0.9 }} />
        {fuentes.map((f, i) => (
          <CircleMarker
            key={`${f.lat},${f.lon},${i}`}
            center={[f.lat, f.lon]}
            radius={6}
            pathOptions={{
              color: tema.palette.background.paper,
              weight: 2,
              fillColor: tema.palette.primary.main,
              fillOpacity: 1,
            }}
          >
            {/* Tooltip y no popup: se mira de pasada, y abrir globos en una lista de veinte
                fuentes es más trabajo que leer la lista de al lado. */}
            <Tooltip direction="top">{`km ${f.kmRuta.toFixed(1)} · ${f.nombre}`}</Tooltip>
          </CircleMarker>
        ))}
        {/* El punto que sigue al dedo sobre el perfil, como en Wikiloc. Va DESPUÉS de las
            fuentes para que quede por encima cuando pasa sobre una, y en un color de
            contraste: si fuera del mismo azul que la línea y las fuentes, sobre el trazado
            no se distinguiría de ellas justo cuando se está mirando.
            `interactive: false` porque no es un objetivo que pulsar, y sin ello se traga
            los clics del mapa por donde pasa. */}
        {señal && (
          <CircleMarker
            center={[señal.lat, señal.lon]}
            radius={7}
            pathOptions={{
              color: tema.palette.background.paper,
              weight: 3,
              fillColor: tema.palette.text.primary,
              fillOpacity: 1,
              interactive: false,
            }}
          />
        )}
      </MapContainer>

      {/* Ampliar / reducir. Fondo opaco para que se lea sobre las teselas —lo de siempre
          con lo que flota sobre el mapa—, y por encima de los controles de Leaflet (que
          están a la izquierda, así que no chocan). */}
      <IconButton
        onClick={() => setAmpliado((v) => !v)}
        aria-label={t(ampliado ? 'gpxIn.collapseMap' : 'gpxIn.expandMap')}
        size="small"
        sx={{
          position: 'absolute', top: 8, right: 8, zIndex: 1000,
          bgcolor: 'background.paper', boxShadow: 2,
          '&:hover': { bgcolor: 'background.paper' },
        }}
      >
        {ampliado ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
      </IconButton>
    </Box>
  )
}
