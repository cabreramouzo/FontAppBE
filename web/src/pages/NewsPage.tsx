import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'
import { ActivityGrid } from '../components/ActivityGrid'
import { PulseStrip } from '../components/PulseStrip'

/**
 * Novedades: la otra mitad de la app. El mapa dice dónde hay fuentes; esto dice qué ha
 * cambiado desde la última vez, que es de lo que vive una app cuyo valor es la
 * frescura del dato.
 *
 * Pública: fuentes, reseñas e incidencias ya se ven en la ficha de cada fuente.
 */
export function NewsPage() {
  const { t } = useI18n()

  useEffect(() => {
    document.title = `${t('news.title')} · FontApp`
  }, [t])

  return (
    <Box className="pad" sx={{ maxWidth: 1040, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>📰 {t('news.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('news.intro')}</Typography>
      {/* Antes del mosaico y no después: es corto, y detrás de treinta piezas no lo ve
          nadie. Se pinta solo si hay algo que contar, así que no roba sitio en vacío. */}
      <PulseStrip />
      <ActivityGrid limit={30} />
    </Box>
  )
}
