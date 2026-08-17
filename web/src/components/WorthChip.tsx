import { useEffect, useState } from 'react'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import WaterDropIcon from '@mui/icons-material/WaterDropOutlined'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { freshnessOf } from '../lib/freshness'
import { freshnessCurve, isWorthHighlighting, worthNow, type Tramo } from '../lib/worth'

/**
 * «Vale 70 gotas»: lo que paga comprobar esta fuente ahora mismo.
 *
 * Se pinta **solo cuando paga más de lo normal** (más de 30 días sin comprobar, o nunca).
 * Una etiqueta en todas las fuentes no señalaría ninguna, y la gracia de la curva de
 * frescura es precisamente empujar hacia las olvidadas — que además son casi todas.
 *
 * No se pinta a quien apagó la gamificación: ha pedido no ver puntos y esto son puntos.
 * A quien no tiene sesión **sí**, a propósito: es de las pocas cosas que explican de un
 * vistazo para qué sirve registrarse.
 */
export function WorthChip({ lastCheck, size = 'small' }: { lastCheck: string | null | undefined; size?: 'small' | 'medium' }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const [tramos, setTramos] = useState<Tramo[]>([])

  useEffect(() => { freshnessCurve().then(setTramos) }, [])

  if (user?.gamificationOptOut) return null
  const { days } = freshnessOf(lastCheck)
  if (!isWorthHighlighting(days)) return null
  const gotas = worthNow(days, tramos)
  if (gotas == null) return null

  return (
    <Tooltip title={days === null ? t('worth.neverHint') : t('worth.staleHint', { n: String(days) })}>
      <Chip
        size={size}
        icon={<WaterDropIcon sx={{ fontSize: 14 }} />}
        label={t('worth.label', { n: gotas.toLocaleString(lang) })}
        sx={{
          height: 20,
          fontWeight: 700,
          // Ámbar y no el azul de la app: es una oportunidad, no un estado de la fuente,
          // y compite en la misma línea con el chip de frescura, que sí es estado.
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
          '& .MuiChip-icon': { color: 'inherit' },
          '& .MuiChip-label': { px: 0.75 },
        }}
      />
    </Tooltip>
  )
}
