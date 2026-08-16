import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import { getGamification } from '../api/client'
import type { GamificationProfile } from '../api/types'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'

/**
 * Colores de los escalones, uno por tema. Bronce/plata/oro se reconocen sin leer la
 * palabra, pero el bronce que funciona sobre papel se queda en 4,2:1 sobre el fondo
 * oscuro — por debajo del 4,5 que pide la WCAG para texto normal. Dos juegos, no uno.
 */
const TIER_COLOR: Record<'light' | 'dark', Record<string, string>> = {
  light: { bronce: '#8A5A38', plata: '#5E6B77', oro: '#8F6D10', única: '#3F6E5D' },
  dark: { bronce: '#D6A175', plata: '#B3BFCA', oro: '#E3BE58', única: '#84C4AC' },
}

/**
 * El marcador de gamificación en el perfil. Fase 3 del plan (docs/gamificacion.md).
 *
 * El orden de lectura está elegido: primero **el impacto sobre el mapa** y después los
 * puntos. «12 fuentes tienen foto gracias a ti» dice algo verdadero del mundo; «1 240
 * gotas» solo dice algo del contador. Quien no quiera jugar se queda con lo primero y no
 * ha perdido nada.
 *
 * No se pinta nada si el usuario la tiene apagada (el backend responde 204) ni si todavía
 * no ha aportado nada: un marcador a cero el primer día no motiva, avisa de que vas último.
 */
export function GamificationCard() {
  const { t, lang } = useI18n()
  const tier = TIER_COLOR[useTheme().palette.mode === 'dark' ? 'dark' : 'light']
  const [data, setData] = useState<GamificationProfile | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    getGamification()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setCargando(false))
  }, [])

  if (cargando || !data) return null
  const aportaAlgo = data.gotes > 0 || data.pending > 0
  if (!aportaAlgo) return null

  const { impact } = data
  const impactos = [
    { icon: <PhotoCameraOutlinedIcon fontSize="small" />, n: impact.fontsWithPhotoThanksToYou, label: t('game.impact.photos') },
    { icon: <VisibilityOutlinedIcon fontSize="small" />, n: impact.fontsYouKeepFresh, label: t('game.impact.fresh') },
    { icon: <AddLocationAltOutlinedIcon fontSize="small" />, n: impact.fontsYouPutOnTheMap, label: t('game.impact.created') },
  ].filter((i) => i.n > 0)

  // Progreso hacia el siguiente nivel. Sin siguiente (nivel máximo) no se pinta barra.
  const restan = data.gotesToNextLevel ?? 0
  const progreso = data.nextLevel && restan > 0
    ? Math.max(0, Math.min(100, (data.gotes / (data.gotes + restan)) * 100))
    : null

  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>{t('game.title')}</Typography>

      {impactos.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
          {impactos.map((i) => (
            <Box
              key={i.label}
              sx={{
                flex: '1 1 150px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 1,
                p: 1.5, borderRadius: 2, bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ color: 'primary.main', display: 'flex', pt: '2px' }}>{i.icon}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, lineHeight: 1.1, fontSize: '1.4rem' }}>{i.n}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25, display: 'block' }}>
                  {i.label}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <WaterDropOutlinedIcon fontSize="small" sx={{ color: 'primary.main', alignSelf: 'center' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '1.25rem' }}>
          {data.gotes.toLocaleString(lang)}
        </Typography>
        <Typography color="text.secondary">{t('game.gotes')}</Typography>
        {/* El backend manda la clave del nivel (`river`), no su nombre: el rótulo se
            traduce aquí. Antes llegaba «Río» hecho y salía en castellano en las cinco. */}
        <Chip label={t(`game.level.${data.level}`)} size="small" sx={{ ml: 0.5, fontWeight: 700 }} />
        {data.pending > 0 && (
          <Tooltip title={t('game.pendingHint')}>
            <Chip
              label={t('game.pending', { n: String(data.pending) })}
              size="small" variant="outlined" color="warning"
            />
          </Tooltip>
        )}
      </Box>

      {progreso !== null && (
        <Box sx={{ mt: 1, maxWidth: 420 }}>
          <LinearProgress variant="determinate" value={progreso} sx={{ height: 6, borderRadius: 3 }} />
          <Typography variant="caption" color="text.secondary">
            {t('game.toNext', {
              n: restan.toLocaleString(lang),
              level: data.nextLevel ? t(`game.level.${data.nextLevel}`) : '',
            })}
          </Typography>
        </Box>
      )}

      {data.badges.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
          {data.badges.map((b) => (
            <Tooltip key={b.family} title={t('game.badgeProgress', { n: String(b.progress), m: String(b.threshold) })}>
              <Chip
                label={`${b.family} · ${b.tier}`}
                size="small"
                sx={{
                  fontWeight: 600,
                  color: tier[b.tier] ?? 'text.primary',
                  borderColor: tier[b.tier] ?? 'divider',
                }}
                variant="outlined"
              />
            </Tooltip>
          ))}
        </Box>
      )}

      {data.byKind.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          {data.byKind.map((k) => (
            <Typography key={k.kind} variant="body2" color="text.secondary">
              {k.count} × {k.label} — {k.gotes.toLocaleString(lang)} {t('game.gotes')}
            </Typography>
          ))}
        </Box>
      )}

      {/* Se avisa mientras el baremo se calibra. Prometer que los puntos no cambian y que
          cambien es peor que decir desde el principio que aún se están ajustando. */}
      {data.provisional && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {t('game.provisional')}
        </Typography>
      )}
    </Box>
  )
}
