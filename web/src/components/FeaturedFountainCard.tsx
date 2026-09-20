import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
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
 *
 * **En móvil arranca colapsada**, igual que la tira de «Quién sube» (`PulseStrip`): la
 * portada de novedades ya lleva la fuente de la semana, «quién sube» y los filtros antes
 * del mosaico, que es lo que se viene a ver, así que las dos secciones que no son el
 * contenido se pliegan a una fila con su chevron. Colapsada enseña el nombre —lo bastante
 * para saber cuál es—; al desplegar aparecen el porqué y el botón. En escritorio hay sitio
 * y se pinta entera.
 */
export function FeaturedFountainCard() {
  const { t } = useI18n()
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [f, setF] = useState<FeaturedFountain | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let vivo = true
    let reloj: ReturnType<typeof setTimeout> | undefined
    let intentos = 0
    // El primer `getCurrentPosition` de la sesión sale frío y `positionIfAllowed` puede
    // devolver `null`; ese intento calienta el GPS, así que en unos segundos ya hay un fix.
    // Sin reintentar, la tarjeta solo aparecía al volver a entrar en la pestaña. Con el
    // caché de `quietPosition`, el reintento acierta en cuanto haya posición.
    async function intenta() {
      const pos = await positionIfAllowed().catch(() => null)
      if (!vivo) return
      if (pos) {
        const d = await getFeaturedFountain(pos).catch(() => null)
        if (vivo && d) setF(d)
        return
      }
      if (intentos++ < 4) reloj = setTimeout(() => { if (vivo) void intenta() }, 3000)
    }
    void intenta()
    return () => { vivo = false; if (reloj) clearTimeout(reloj) }
  }, [])

  if (!f) return null
  const emoji = f.source ? SOURCE_EMOJI[f.source] : '💧'
  const nombre = nombreFuente({ name: f.name, source: f.source }, t)
  const porque = f.neverChecked
    ? t('featured.never')
    : t('featured.stale', { d: String(f.days ?? 0) })

  if (mobile) {
    return (
      <Box
        component="section"
        sx={{
          mb: 2, borderRadius: 2, overflow: 'hidden',
          border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover',
        }}
      >
        <ButtonBase
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          sx={{ width: '100%', minHeight: 52, px: 1.5, py: 1, justifyContent: 'flex-start', textAlign: 'left', gap: 1 }}
        >
          <Box component="span" sx={{ fontSize: '1.6rem', lineHeight: 1 }}>{emoji}</Box>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
              {t('featured.title')}
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>{nombre}</Typography>
          </Box>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ButtonBase>
        <Collapse in={open} unmountOnExit>
          <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">{porque}</Typography>
            <Button component={RouterLink} to={`/fonts/${f.fontID}`} variant="contained" sx={{ alignSelf: 'flex-start' }}>
              {t('featured.go')}
            </Button>
          </Box>
        </Collapse>
      </Box>
    )
  }

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
        <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{nombre}</Typography>
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
