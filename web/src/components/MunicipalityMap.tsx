import { useEffect, useMemo } from 'react'
import { MapContainer, CircleMarker, Polygon, Tooltip, useMap } from 'react-leaflet'
import { useTheme } from '@mui/material/styles'
import type { LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BaseLayerTile } from './BaseLayers'
import { MAP_LAYERS } from '../lib/mapLayers'
import { NO_STATUS_COLOR, WATER_STATUS_OPTIONS, statusColor, waterStatusInfo } from '../lib/waterStatus'
import type { MunicipalBoundary, MunicipalReport } from '../api/client'
import { rotulo } from '../lib/fontName'
import { useI18n } from '../i18n/I18nContext'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

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

  // ## La leyenda, y solo con lo que hay
  //
  // Un punto de color sin leyenda es un dato que solo entiende quien ya conoce la app, y
  // esta página está pensada para enseñársela a alguien que llega de cero.
  //
  // Se pintan **únicamente los estados presentes en este municipio**: una leyenda de seis
  // filas fija para un pueblo que solo tiene tres colores obliga a buscar cuál de ellas
  // sirve, y de paso promete estados que aquí no existen. Misma regla que los chips de
  // «lo que falta» y que `WorthChip`: una etiqueta que sale siempre no señala nada.
  //
  // El azul va **el último y con su propio rótulo**, «sin comprobar nunca». En el mapa
  // grande ese color se rotula «desconocido» porque allí no se puede distinguir; aquí sí
  // se sabe, y decir «desconocido» dos veces —una para el azul y otra para el gris de
  // quien pasó y no supo decirlo— sería confundir dos cosas distintas a propósito.
  const leyenda: { color: string; texto: string; n: number }[] = [
    ...WATER_STATUS_OPTIONS
      .map((k) => ({ clave: k, n: datos.byLastStatus[k] ?? 0 }))
      .filter((x) => x.n > 0)
      .map((x) => ({
        color: waterStatusInfo(x.clave)?.color ?? NO_STATUS_COLOR,
        texto: t(`status.${x.clave}`),
        n: x.n,
      })),
    ...(datos.neverChecked > 0
      ? [{ color: NO_STATUS_COLOR, texto: t('muni.neverChecked'), n: datos.neverChecked }]
      : []),
  ]

  if (datos.items.length === 0) return null

  // El mundo entero como exterior y el municipio como agujeros: lo de dentro se ve normal
  // y lo de fuera queda apagado.
  const mundo: LatLngTuple[] = [[-90, -180], [-90, 180], [90, 180], [90, -180]]

  return (
    <>
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

    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
      {leyenda.map((l) => (
        <Box key={l.texto} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
          <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: l.color, flexShrink: 0 }} />
          {/* Mayúscula inicial con `::first-letter` y no con `capitalize`, que pondría en
              mayúscula **cada palabra** («Sin Comprobar Nunca»). Hace falta porque el
              rótulo del azul reutiliza la clave de los chips de arriba, escrita para ir
              detrás de un número («7 sin comprobar nunca»), y aquí va la primera.
              Y `display: inline-block` no es cosmético: `::first-letter` **solo se aplica
              a cajas de bloque**, y `Typography variant="caption"` es un `<span>` inline,
              así que sin esto la regla no hace nada — y no falla, simplemente se ignora. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-block', '&::first-letter': { textTransform: 'uppercase' } }}>
            {l.texto} · {l.n}
          </Typography>
        </Box>
      ))}
    </Box>
    </>
  )
}
