import { useState } from 'react'
import Button from '@mui/material/Button'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import type { Map as LeafletMap } from 'leaflet'
import type { FontSummary } from '../api/types'
import { apiFetch, trackInteraction } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from './ToastContext'
import { nombreFuente } from '../lib/fontName'
import { waterStatusInfo } from '../lib/waterStatus'
import { sourceInfo } from '../lib/waterType'
import { timeAgo } from '../lib/time'
import { construyeGPX, nombreFichero, MAX_WAYPOINTS, type PuntoGPX } from '../lib/gpx'

/**
 * Descarga las fuentes de la vista actual como GPX, para el GPS del manillar.
 *
 * Lo pidió un ciclista de montaña, y el detalle que lo explica todo es **dónde** está
 * cuando le hace falta: planifica en Wikiloc y rueda con un Garmin en la bici. No va a
 * sacar el móvil en una bajada, así que la app no le sirve en el momento en que tiene sed.
 * Lo que le sirve es que las fuentes estén en el aparato con el que ya va.
 *
 * No hay endpoint nuevo: se piden las de la caja visible con `/fonts/in-bounds`, que ya
 * existía y es pública, y el fichero se compone en el navegador (`lib/gpx.ts`, con tests).
 *
 * ## La descripción de cada punto dice lo que sabemos, incluso cuando no sabemos nada
 *
 * «Fuente natural · Sale agua (hace 3 días)» y, si nadie ha pasado nunca, se dice. Un
 * waypoint que promete agua y no la tiene es peor que no llevarlo: te ha hecho desviarte.
 * Es la misma honestidad que la ficha, llevada al aparato.
 */
/**
 * Recibe el **mapa**, no sus límites, y esto es el detalle que costó una prueba.
 *
 * Con `bounds={map.getBounds()}` el valor se calcula en el render, y React no repinta al
 * mover el mapa: te llevas la caja de la última vez que este componente se pintó, que en la
 * primera carga es **antes de que el mapa tenga tamaño** — medido, salía `minLat` igual a
 * `maxLat`, o sea una caja de altura cero, y el fichero venía vacío sin ningún error. Lo
 * que se mira al pulsar hay que leerlo al pulsar.
 */
export function ExportGpxButton({ map }: { map: LeafletMap | null }) {
  const { t } = useI18n()
  const toast = useToast()
  const [bajando, setBajando] = useState(false)

  async function descargar() {
    if (!map || bajando) return
    const bounds = map.getBounds()
    setBajando(true)
    try {
      trackInteraction('map_export_gpx')
      const params = new URLSearchParams({
        minLat: String(bounds.getSouth()), maxLat: String(bounds.getNorth()),
        minLong: String(bounds.getWest()), maxLong: String(bounds.getEast()),
      })
      const fuentes = await apiFetch<FontSummary[]>(`/fonts/in-bounds?${params}`)
      if (fuentes.length === 0) {
        toast.show(t('gpx.empty'))
        return
      }

      // Si hay más de las que caben, se quedan las del centro de la vista: es lo que
      // estabas mirando, y recortar por orden de la base dejaría un fichero con las
      // fuentes de una esquina al azar.
      const centro = bounds.getCenter()
      const ordenadas = fuentes.length > MAX_WAYPOINTS
        ? [...fuentes].sort((a, b) =>
            (a.latitude - centro.lat) ** 2 + (a.longitude - centro.lng) ** 2
            - ((b.latitude - centro.lat) ** 2 + (b.longitude - centro.lng) ** 2))
        : fuentes

      const puntos: PuntoGPX[] = ordenadas.map((f) => ({
        lat: f.latitude,
        lon: f.longitude,
        nombre: nombreFuente(f, t),
        descripcion: describe(f),
      }))

      const gpx = construyeGPX(puntos)
      const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = nombreFichero()
      a.click()
      // Sin esto el blob se queda en memoria hasta recargar; con varias descargas seguidas
      // se acumulan ficheros enteros.
      setTimeout(() => URL.revokeObjectURL(url), 0)

      const n = Math.min(puntos.length, MAX_WAYPOINTS)
      toast.show(puntos.length > MAX_WAYPOINTS
        ? t('gpx.doneCapped', { n: String(n), total: String(puntos.length) })
        : t('gpx.done', { n: String(n) }))
    } catch {
      toast.show(t('gpx.failed'))
    } finally {
      setBajando(false)
    }
  }

  /** Tipo, último estado y cuándo. Lo que decide si merece la pena desviarse. */
  function describe(f: FontSummary): string {
    const src = sourceInfo(f.source)
    const ws = waterStatusInfo(f.lastWaterStatus ?? null)
    const partes = [
      src ? t(src.labelKey) : null,
      ws && f.lastUpdate ? `${t(`status.${ws.key}`)} (${timeAgo(f.lastUpdate, t)})`
        : ws ? t(`status.${ws.key}`)
        : t('gpx.unchecked'),
    ]
    return partes.filter(Boolean).join(' · ')
  }

  return (
    <Button
      variant="outlined"
      startIcon={<DownloadIcon />}
      onClick={() => void descargar()}
      disabled={!map || bajando}
      sx={{ textTransform: 'none', justifyContent: 'flex-start', minHeight: 48 }}
      fullWidth
    >
      {bajando ? t('gpx.working') : t('gpx.download')}
    </Button>
  )
}
