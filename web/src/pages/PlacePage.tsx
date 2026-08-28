import { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import MapIcon from '@mui/icons-material/MapOutlined'
import { fetchPlace, type PlacePage as Datos } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { nombreFuente } from '../lib/fontName'
import { CONFIDENCE_EMOJI, confidenceOf } from '../lib/confidence'

/**
 * Una página por pueblo: «Fonts a Moià».
 *
 * ## Para qué es
 *
 * Es la única pieza del proyecto que puede traer gente **cuando dejas de empujar**. Nadie
 * busca el nombre de una fuente suelta —y por eso el sitemap de fichas solo puede ofrecer
 * las 553 que ha tocado alguien—, pero «fonts Moià» o «fuentes en Castellterçol» sí se
 * busca. Con 4.436 pueblos que tienen al menos tres fuentes cerca, son 4.436 páginas con
 * algo que contar desde el primer día.
 *
 * ## Y por eso enseña lo que enseña
 *
 * El nombre del pueblo en el título, la lista de fuentes con su nombre real —que es el
 * contenido que hace que la página no sea relleno— y **enlaces a los pueblos de al lado**.
 * Lo último no es adorno: sin enlaces entre ellas, miles de páginas cuelgan solo del
 * sitemap y se rastrean mal.
 */
export function PlacePage() {
  const { slug = '' } = useParams()
  const { t } = useI18n()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setDatos(null); setError(false)
    void fetchPlace(slug).then(setDatos).catch(() => setError(true))
  }, [slug])

  if (error) return <Box className="pad"><Alert severity="error">{t('place.notFound')}</Alert></Box>
  if (!datos) return null

  const { place, fonts, nearby } = datos
  // El título lleva la demarcación cuando se sabe: hay 86 nombres repetidos en España y
  // «Fuentes en El Campillo» a secas no dice cuál de los tres.
  const titulo = place.region
    ? t('place.titleWithRegion', { place: place.name, region: place.region })
    : t('place.title', { place: place.name })
  const comprobadas = fonts.filter((f) => f.lastWaterStatus).length

  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h4" component="h1" sx={{ my: 1, fontWeight: 800 }}>{titulo}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('place.intro', { n: String(place.fontCount), place: place.name })}
      </Typography>

      {/* Lo que de verdad hace falta saber, y sin adornarlo: en casi todas partes es cero.
          Decirlo es lo que convierte la página en una invitación a aportar en vez de en
          una promesa que no se sostiene. */}
      <Alert severity={comprobadas > 0 ? 'success' : 'info'} sx={{ mb: 2 }}>
        {comprobadas > 0
          ? t('place.checked', { n: String(comprobadas), total: String(fonts.length) })
          : t('place.noneChecked')}
      </Alert>

      <Button
        component={RouterLink}
        to={`/?lat=${place.latitude}&long=${place.longitude}&zoom=14`}
        variant="contained" disableElevation startIcon={<MapIcon />}
        sx={{ textTransform: 'none', mb: 3 }}
      >
        {t('place.openMap')}
      </Button>

      <Typography variant="h6" component="h2" gutterBottom>{t('place.list')}</Typography>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {fonts.map((f) => {
          // `FontSummary` ya trae los campos de la evidencia, como en el mapa.
          const nivel = confidenceOf(f)
          return (
            <Box component="li" key={f.id} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              <Link component={RouterLink} to={`/fonts/${f.id}`} underline="hover">
                {CONFIDENCE_EMOJI[nivel]} {nombreFuente(f, t)}
              </Link>
            </Box>
          )
        })}
      </Box>

      {nearby.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" component="h2" gutterBottom>{t('place.nearby')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {nearby.map((v) => (
              <Chip
                key={v.slug}
                component={RouterLink}
                to={`/places/${v.slug}`}
                clickable
                label={`${v.name} · ${v.fontCount}`}
                sx={{ textDecoration: 'none' }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}
