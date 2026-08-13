import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from 'leaflet'
// La hoja de estilos va aquí y no solo en MapPage: esa página se carga en diferido,
// así que quien entra DIRECTO a la ficha de una fuente (un enlace compartido o el del
// resumen semanal) nunca la descarga, y sin ella las teselas se apilan una debajo de
// otra en vez de colocarse. Vite no la duplica en el paquete final.
import 'leaflet/dist/leaflet.css'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import UndoIcon from '@mui/icons-material/Undo'
import { useI18n } from '../i18n/I18nContext'
import { haversineKm, formatDist } from '../lib/geo'

// El pin se mueve tocando el mapa.
function PickOnMap({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng) })
  return null
}

// El mapa nace dentro de un formulario que aún se está colocando, así que Leaflet
// mide mal el contenedor y solo pinta teselas en un trozo. Al montar le decimos que
// vuelva a medirse.
function AjustaTamaño() {
  const map = useMap()
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(id)
  }, [map])
  return null
}

/**
 * Reubicar una fuente mal situada. Solo para quien la añadió (o un admin).
 *
 * Hace falta porque la ubicación suele venir del GPS del móvil en el momento de
 * crearla, y bajo los árboles o entre paredes de roca se va con facilidad decenas de
 * metros. Quien la puso es quien sabe dónde estaba de verdad.
 *
 * Dos formas de corregir, porque se usan en momentos distintos: tocar el mapa (en
 * casa, mirando la ortofoto) y "estoy delante de ella" (a pie de fuente, que es
 * cuando te das cuenta del error).
 */
export function RelocateFont({
  lat,
  lng,
  original,
  onChange,
}: {
  lat: number
  lng: number
  original: { lat: number; lng: number }
  onChange: (lat: number, lng: number) => void
}) {
  const { t } = useI18n()
  const [geoError, setGeoError] = useState('')
  const [buscando, setBuscando] = useState(false)
  // Precisión declarada por el móvil en la última lectura, en metros.
  const [precision, setPrecision] = useState<number | null>(null)

  // Por encima de esto el GPS no sirve para colocar un pin: bajo roca, en un hoyo o
  // entre arbolado espeso el teléfono resuelve por antenas y se va decenas de metros.
  const PRECISION_MALA = 25

  const movido = haversineKm(original.lat, original.lng, lat, lng) * 1000

  function usarMiUbicacion() {
    setGeoError('')
    if (!navigator.geolocation || !window.isSecureContext) {
      setGeoError(t('map.geoUnavailable'))
      return
    }
    setBuscando(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange(p.coords.latitude, p.coords.longitude)
        setPrecision(p.coords.accuracy)
        setBuscando(false)
      },
      () => {
        setGeoError(t('map.geoFailed'))
        setBuscando(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>📍 {t('relocate.title')}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('relocate.hint')}
      </Typography>

      <Box sx={{ height: 220, borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
        {/* `key` con la posición original: si se abre el formulario de otra fuente,
            el mapa se recrea en su sitio en vez de quedarse donde estaba. */}
        <MapContainer key={`${original.lat},${original.lng}`} center={[lat, lng]} zoom={17} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[lat, lng]} />
          <PickOnMap onPick={(p) => onChange(p.lat, p.lng)} />
          <AjustaTamaño />
        </MapContainer>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" startIcon={<MyLocationIcon />} onClick={usarMiUbicacion} disabled={buscando}>
          {buscando ? t('relocate.locating') : t('relocate.useMyLocation')}
        </Button>
        {movido >= 1 && (
          <Button size="small" startIcon={<UndoIcon />} onClick={() => onChange(original.lat, original.lng)}>
            {t('relocate.undo')}
          </Button>
        )}
      </Box>

      {movido >= 1 && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
          {t('relocate.moved', { d: formatDist(movido / 1000) })}
        </Typography>
      )}
      {precision !== null && (
        // Se dice siempre, no solo cuando es mala: que el usuario sepa con qué
        // margen está colocando el pin, y decida si se fía o lo afina a mano.
        <Alert severity={precision > PRECISION_MALA ? 'warning' : 'info'} sx={{ mt: 1 }}>
          {precision > PRECISION_MALA
            ? t('relocate.poorAccuracy', { m: String(Math.round(precision)) })
            : t('relocate.accuracy', { m: String(Math.round(precision)) })}
        </Alert>
      )}
      {geoError && <Alert severity="warning" sx={{ mt: 1 }}>{geoError}</Alert>}
    </Box>
  )
}
