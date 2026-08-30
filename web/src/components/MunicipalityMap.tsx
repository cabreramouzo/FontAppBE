import { useEffect, useMemo } from 'react'
import { MapContainer, CircleMarker, Polygon, Tooltip, useMap } from 'react-leaflet'
import { useTheme } from '@mui/material/styles'
import type { LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BaseLayerTile } from './BaseLayers'
import { MAP_LAYERS } from '../lib/mapLayers'
import { statusColor } from '../lib/waterStatus'
import type { MunicipalBoundary, MunicipalReport } from '../api/client'
import { rotulo } from '../lib/fontName'
import { useI18n } from '../i18n/I18nContext'

/**
 * Las fuentes de un municipio, con el municipio recortado sobre el resto del mapa.
 *
 * ## La máscara: el municipio en claro y lo demás en gris
 *
 * Es el efecto del mapa del Meteocat, y se hace **sin ninguna capa nueva**: un polígono
 * que cubre el mundo entero con el municipio como **agujero**, relleno de gris
 * semitransparente. Leaflet dibuja agujeros pasando `[exterior, hueco1, hueco2…]`, así
 * que la máscara es una sola figura y no hay que recortar teselas ni pedir nada al
 * servidor.
 *
 * Importa por qué esto no es decoración: la página dice «las fuentes de Castellcir» y sin
 * el recorte no hay forma de saber **dónde acaba Castellcir**. Con el mapa a secas, una
 * fuente pegada al límite parece de aquí o de al lado según se mire.
 *
 * El polígono es el **mismo del IGN** que usó `populate-municipalities` para decidir en
 * qué municipio cae cada fuente. Si se dibujara otro —una aproximación, o los límites de
 * otro proveedor— habría fuentes pintadas fuera de su propio municipio y no habría manera
 * de saber cuál de las dos cosas está mal.
 *
 * ## Lo que NO se pinta
 *
 * Las fuentes **de los municipios vecinos**. Se pensó pintarlas en gris para reforzar el
 * «éstas no son tuyas», y son otra petición y otro puñado de puntos para decir algo que
 * la máscara ya dice. La página va de un municipio.
 */
/**
 * Encuadra el mapa **después** de que el contenedor tenga tamaño.
 *
 * Sin esto el mapa sale al zoom máximo, mirando un bosque: este componente entra por un
 * `lazy()` dentro de un `Suspense`, así que Leaflet se crea en el mismo tick en que
 * aparece el `<div>` y `getSize()` todavía es 0×0 — `fitBounds` sobre un mapa sin tamaño
 * elige el zoom más cerrado que hay. No da ningún error y desde fuera parece que el
 * encuadre esté mal calculado.
 *
 * El `setTimeout` y no `requestAnimationFrame` por lo mismo que en `AsomaElPin`: los
 * navegadores congelan los fotogramas con la pestaña oculta y entonces el encuadre no
 * llegaría a ocurrir nunca.
 */
function Encuadre({ bounds }: { bounds: [LatLngTuple, LatLngTuple] }) {
  const map = useMap()
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize()
      map.fitBounds(bounds, { padding: [24, 24] })
    }, 0)
    return () => window.clearTimeout(id)
  }, [map, bounds])
  return null
}

export function MunicipalityMap({ datos, contorno }: {
  datos: MunicipalReport
  contorno: MunicipalBoundary | null
}) {
  const tema = useTheme()
  const { t } = useI18n()

  // Leaflet quiere [lat, lon] y GeoJSON viene en [lon, lat]. Es el cambio de orden que se
  // olvida siempre y que no da ningún error: el mapa sale vacío o en mitad del océano.
  const anillos = useMemo<LatLngTuple[][]>(() => {
    if (!contorno) return []
    return contorno.multiPolygon.flatMap((poligono) =>
      poligono.map((anillo) => anillo.map(([lon, lat]) => [lat, lon] as LatLngTuple)))
  }, [contorno])

  const bounds = useMemo<[LatLngTuple, LatLngTuple]>(() => {
    if (contorno) {
      const [minLong, minLat, maxLong, maxLat] = contorno.bbox
      return [[minLat, minLong], [maxLat, maxLong]]
    }
    // Sin contorno, el encuadre sale de las propias fuentes. Pasa fuera de España, donde
    // no hay límites del IGN: entonces el mapa sigue sirviendo y solo falta el recorte.
    const lats = datos.items.map((f) => f.latitude)
    const lons = datos.items.map((f) => f.longitude)
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]]
  }, [contorno, datos])

  if (datos.items.length === 0) return null

  // El mundo entero como exterior y el municipio como agujeros: lo de dentro se ve normal
  // y lo de fuera queda apagado.
  const mundo: LatLngTuple[] = [[-90, -180], [-90, 180], [90, 180], [90, -180]]

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom={false}
      style={{ height: 380, width: '100%', borderRadius: 12 }}
    >
      <Encuadre bounds={bounds} />
      <BaseLayerTile layer={MAP_LAYERS[0]} />

      {anillos.length > 0 && (
        <>
          {/* La máscara. `interactive={false}` es importante: si captura los clics, no se
              puede arrastrar el mapa por fuera del municipio ni tocar nada de alrededor. */}
          <Polygon
            positions={[mundo, ...anillos]}
            interactive={false}
            pathOptions={{
              stroke: false,
              fillColor: tema.palette.mode === 'dark' ? '#000' : '#5b6b7a',
              fillOpacity: tema.palette.mode === 'dark' ? 0.55 : 0.35,
              // Sin esto Leaflet usa `evenodd` y con varios polígonos —Castellcir tiene
              // dos— los agujeros se anulan entre sí en algunos navegadores.
              fillRule: 'evenodd',
            }}
          />
          {/* Y el borde encima, que es lo que se lee como «hasta aquí». Éste SÍ es
              interactivo: al pasar por encima dice de qué municipio es, como el mapa del
              Meteocat. */}
          <Polygon
            positions={anillos}
            pathOptions={{ color: tema.palette.primary.main, weight: 2, fill: false }}
          >
            <Tooltip sticky>{contorno?.name ?? datos.municipality}</Tooltip>
          </Polygon>
        </>
      )}

      {datos.items.map((f) => (
        <CircleMarker
          key={f.id}
          center={[f.latitude, f.longitude]}
          radius={7}
          pathOptions={{
            color: tema.palette.background.paper,
            weight: 2,
            // El mismo color que el pin del mapa grande: verde mana, naranja poca, rojo
            // seca, azul nadie lo sabe. Dos escalas de color para lo mismo en la misma app
            // serían dos leyendas que aprender.
            fillColor: statusColor(f.lastStatus),
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top">
            {rotulo(f.name, t)}
            {f.days == null ? ` · ${t('muni.neverCheckedRow')}` : ` · ${t('muni.checkedAgo', { d: String(f.days) })}`}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
