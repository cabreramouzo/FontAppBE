import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { formatDist, haversineKm } from '../lib/geo'
import { usePhotoExif } from '../lib/photoExif'

/**
 * Bajo una foto, **solo para admins**: cuándo dice el móvil que se hizo y a qué distancia
 * de la fuente.
 *
 * ## Para qué sirve y para qué NO
 *
 * Sirve para responder «¿esta foto es de hoy o la ha sacado de la galería?» cuando algo
 * huele raro. Y **nada más**: el EXIF lo escribe el móvil de quien sube y cualquier editor
 * lo reescribe en diez segundos. Es la misma categoría que `queued_offline` y por tanto la
 * misma regla — puede orientar a una persona, **nunca anular puntos por sí solo**. No hay
 * ningún automatismo leyendo esto, y no debería haberlo.
 *
 * ## Por qué se enseña la distancia y no las coordenadas
 *
 * Porque un par de números no dice nada sin abrir un mapa, y «a 12 m de la fuente» o «a
 * 43 km de la fuente» se entiende de un vistazo. Es además menos dato personal en
 * pantalla: la coordenada exacta de dónde estaba una persona no hace falta para lo que
 * esto resuelve.
 *
 * ## Por qué faltar es lo normal
 *
 * Todo lo que pasa por WhatsApp, Telegram o Instagram llega sin EXIF, las capturas no
 * tienen y iOS lo quita al compartir según los ajustes. Por eso «sin fecha» se dice en
 * gris y sin ningún énfasis: **no es sospechoso de nada** y tratarlo como una señal sería
 * señalar sobre todo a gente honrada.
 */
export function PhotoExifNote({ image, lat, long }: {
  image: string | null | undefined
  /** La fuente, para poder dar la distancia en vez de dos números. */
  lat?: number
  long?: number
}) {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const esAdmin = !!user?.isAdmin
  const meta = usePhotoExif(image, esAdmin)

  if (!esAdmin || !meta) return null

  const partes: string[] = []

  if (meta.takenAt) {
    const hecha = new Date(meta.takenAt)
    partes.push(t('exif.taken', { d: hecha.toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) }))
    if (meta.uploadedAt) {
      // Días enteros: la hora exacta de diferencia no dice nada y el EXIF sin
      // `OffsetTimeOriginal` ni siquiera trae huso, así que fingir minutos sería fingir.
      const dias = Math.floor((+new Date(meta.uploadedAt) - +hecha) / 86_400_000)
      partes.push(dias < 1 ? t('exif.sameDay') : t('exif.daysBefore', { n: String(dias) }))
    }
  } else {
    partes.push(t('exif.noDate'))
  }

  if (meta.latitude != null && meta.longitude != null && lat != null && long != null) {
    partes.push(t('exif.near', { d: formatDist(haversineKm(lat, long, meta.latitude, meta.longitude)) }))
  } else if (meta.latitude == null) {
    partes.push(t('exif.noGps'))
  }

  return (
    <Tooltip title={t('exif.hint')}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5, cursor: 'help' }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 13 }} />
        {partes.join(' · ')}
      </Typography>
    </Tooltip>
  )
}
