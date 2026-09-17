import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { getFeaturedFountain } from '../api/client'
import type { FeaturedFountain } from '../api/client'
import { SOURCE_EMOJI } from '../lib/waterType'
import { nombreFuente } from '../lib/fontName'
import { positionIfAllowed } from '../lib/quietPosition'
import { useI18n } from '../i18n/I18nContext'

/**
 * La fuente de la semana: una olvidada cerca de ti, para ir a comprobarla. Es el empujón
 * a un sitio nuevo que le faltaba a la app —`WorthChip` solo lo dice si ya estás ahí—.
 *
 * Solo se pinta si el navegador ya tenía la ubicación concedida (no se pide a bocajarro en
 * una página de lectura) y si alrededor hay alguna fuente olvidada (204 → nada). No toca el
 * baremo: solo destaca.
 */
export function FeaturedFountainCard() {
  const { t } = useI18n()
  const [f, setF] = useState<FeaturedFountain | null>(null)

  useEffect(() => {
    let vivo = true
    positionIfAllowed()
      .then((pos) => (vivo && pos ? getFeaturedFountain(pos) : null))
      .then((d) => { if (vivo && d) setF(d) })
      .catch(() => { if (vivo) setF(null) })
    return () => { vivo = false }
  }, [])

  if (!f) return null
  const emoji = f.source ? SOURCE_EMOJI[f.source] : '💧'
  const porque = f.neverChecked
    ? t('featured.never')
    : t('featured.stale', { d: String(f.days ?? 0) })

  return (
    <Box
      component="section"
      sx={{
        mb: 2, p: 2, borderRadius: 2,
        border: '1px solid', borderColor: 'divider',
        bgcolor: 'action.hover',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      }}
    >
      <Box component="span" sx={{ fontSize: '2rem', lineHeight: 1 }}>{emoji}</Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
          {t('featured.title')}
        </Typography>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {nombreFuente({ name: f.name, source: f.source }, t)}
        </Typography>
        <Typography variant="body2" color="text.secondary">{porque}</Typography>
      </Box>
      <Button
        component={RouterLink}
        to={`/fonts/${f.fontID}`}
        variant="contained"
        sx={{ flexShrink: 0 }}
      >
        {t('featured.go')}
      </Button>
    </Box>
  )
}
