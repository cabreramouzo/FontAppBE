import { useMemo } from 'react'
import { MapContainer, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import { useTheme } from '@mui/material/styles'
import type { LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BaseLayerTile } from './BaseLayers'
import { MAP_LAYERS } from '../lib/mapLayers'
import type { PuntoRuta } from '../lib/gpxImport'

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
  const linea = useMemo<LatLngTuple[]>(() => ruta.map((p) => [p.lat, p.lon]), [ruta])

  // El encuadre sale del propio recorrido: no hay «centro» que valga para una ruta.
  const bounds = useMemo<[LatLngTuple, LatLngTuple]>(() => {
    const lats = ruta.map((p) => p.lat)
    const lons = ruta.map((p) => p.lon)
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]]
  }, [ruta])

  if (ruta.length < 2) return null

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom={false}
      style={{ height: 320, width: '100%', borderRadius: 12 }}
    >
      {/* La capa por defecto, sin selector: aquí se viene a mirar la ruta, no a elegir
          cartografía. Quien quiera la ortofoto tiene el mapa de verdad. */}
      <BaseLayerTile layer={MAP_LAYERS[0]} />
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
    </MapContainer>
  )
}
