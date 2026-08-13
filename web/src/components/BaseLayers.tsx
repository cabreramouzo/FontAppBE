import { LayersControl, TileLayer, useMapEvents } from 'react-leaflet'
import { MAP_LAYERS, saveLayer, savedLayer } from '../lib/mapLayers'
import { useI18n } from '../i18n/I18nContext'

/**
 * Selector de capa base (mapa / topográfico / satélite / IGN), compartido por el mapa
 * principal y el de reubicar una fuente.
 *
 * La elección se recuerda: quien camina con el topográfico lo quiere siempre, y quien
 * coloca pines sobre ortofoto también.
 */
export function BaseLayers() {
  const { t } = useI18n()
  const inicial = savedLayer()

  // `baselayerchange` lo dispara el propio control de Leaflet al cambiar de capa.
  useMapEvents({
    baselayerchange: (e) => {
      const capa = MAP_LAYERS.find((l) => t(l.labelKey) === e.name)
      if (capa) saveLayer(capa.id)
    },
  })

  return (
    <LayersControl position="topright">
      {MAP_LAYERS.map((capa) => (
        <LayersControl.BaseLayer key={capa.id} name={t(capa.labelKey)} checked={capa.id === inicial.id}>
          <TileLayer
            url={capa.url}
            attribution={capa.attribution}
            maxZoom={capa.maxZoom}
            // Por encima del zoom máximo de la capa, Leaflet estira la última tesela
            // en vez de dejar el mapa gris. Mejor borroso que vacío.
            maxNativeZoom={capa.maxZoom}
          />
        </LayersControl.BaseLayer>
      ))}
    </LayersControl>
  )
}
