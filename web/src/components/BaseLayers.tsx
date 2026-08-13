import { useState } from 'react'
import { TileLayer } from 'react-leaflet'
import Fab from '@mui/material/Fab'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CheckIcon from '@mui/icons-material/Check'
import LayersIcon from '@mui/icons-material/Layers'
import { MAP_LAYERS, saveLayer, savedLayer, type MapLayer } from '../lib/mapLayers'
import { useI18n } from '../i18n/I18nContext'

/**
 * Capa base elegida, compartida por el mapa y su selector.
 *
 * El estado vive fuera del mapa a propósito: el selector es un control de MUI que se
 * dibuja junto a los demás botones, no dentro del lienzo de Leaflet.
 */
export function useBaseLayer() {
  const [layer, setLayer] = useState<MapLayer>(savedLayer)

  // Quien camina con el topográfico lo quiere siempre; quien coloca pines, la ortofoto.
  function elegir(l: MapLayer) {
    setLayer(l)
    saveLayer(l.id)
  }

  return { layer, setLayer: elegir }
}

/** Las teselas de la capa activa. Va dentro del `MapContainer`. */
export function BaseLayerTile({ layer }: { layer: MapLayer }) {
  return (
    <TileLayer
      // Sin `key` Leaflet reaprovecha la capa y conserva las teselas de la anterior.
      key={layer.id}
      url={layer.url}
      attribution={layer.attribution}
      maxZoom={layer.maxZoom}
      // Por encima del zoom máximo de la capa, Leaflet estira la última tesela en vez
      // de dejar el mapa gris. Mejor borroso que vacío.
      maxNativeZoom={layer.maxZoom}
    />
  )
}

/**
 * Botón de capas. Va FUERA del mapa, junto al resto de controles.
 *
 * Antes era el control propio de Leaflet: en escritorio se abre al pasar el ratón por
 * encima, pero en el móvil eso no existe, así que el botón parecía muerto. Un menú de
 * MUI se abre al tocarlo y además se parece a los demás botones de la app.
 */
export function LayerPicker({
  layer,
  onChange,
  size = 'medium',
}: {
  layer: MapLayer
  onChange: (l: MapLayer) => void
  size?: 'small' | 'medium'
}) {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  return (
    <>
      <Fab
        size={size}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={t('map.layers')}
        title={t('map.layers')}
        sx={{ bgcolor: 'background.paper', color: 'primary.main', '&:hover': { bgcolor: 'background.paper' } }}
      >
        <LayersIcon />
      </Fab>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {MAP_LAYERS.map((l) => (
          <MenuItem
            key={l.id}
            selected={l.id === layer.id}
            onClick={() => {
              onChange(l)
              setAnchor(null)
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>{l.id === layer.id && <CheckIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{t(l.labelKey)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
