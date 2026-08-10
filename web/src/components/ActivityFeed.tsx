import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { alpha } from '@mui/material/styles'
import { getActivity, type ActivityItem } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from './Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'

const KIND_EMOJI: Record<ActivityItem['kind'], string> = {
  fontAdded: '➕',
  review: '💬',
  report: '⚠️',
  edit: '✏️',
}

// Línea de tiempo de lo que pasa en la app: fuentes nuevas, reseñas, incidencias y
// ediciones, todo mezclado por fecha. De un vistazo se ve si esto se mueve y dónde.
export function ActivityFeed({ limit = 15, showFilter = false }: { limit?: number; showFilter?: boolean }) {
  const { t } = useI18n()
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [region, setRegion] = useState('')

  useEffect(() => {
    setItems(null)
    getActivity({ limit, region: region || undefined }).then(setItems).catch(() => setItems([]))
  }, [limit, region])

  // Las zonas del desplegable salen de lo que ya hay en el listado: sin pedir nada más.
  const regions = [...new Set((items ?? []).map((i) => i.region).filter(Boolean))] as string[]

  return (
    <Box>
      {showFilter && regions.length > 1 && (
        <TextField
          select size="small" label={t('activity.region')} value={region}
          onChange={(e) => setRegion(e.target.value)} sx={{ minWidth: 200, mb: 2 }}
        >
          <MenuItem value="">{t('activity.allRegions')}</MenuItem>
          {regions.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
        </TextField>
      )}

      {items === null && <Skeleton lines={4} />}
      {items?.length === 0 && <Typography color="text.secondary">{t('activity.empty')}</Typography>}

      {items?.map((item, i) => {
        const ws = item.waterStatus ? waterStatusInfo(item.waterStatus) : null
        return (
          <Box
            key={`${item.kind}-${item.fontID}-${item.createdAt}-${i}`}
            sx={(theme) => ({
              display: 'flex', gap: 1.5, py: 1.25,
              borderBottom: i === items.length - 1 ? 0 : 1,
              borderColor: 'divider',
              // La incidencia es lo único que pide atención: se tiñe en ámbar.
              ...(item.kind === 'report'
                ? { backgroundColor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.14 : 0.08), px: 1, borderRadius: 1 }
                : {}),
            })}
          >
            <Box sx={{ fontSize: 20, lineHeight: 1.3 }}>{KIND_EMOJI[item.kind]}</Box>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                <Link component={RouterLink} to={`/fonts/${item.fontID}`} sx={{ fontWeight: 700 }}>
                  {item.fontName}
                </Link>
                {ws && (
                  <Chip size="small" label={`${ws.emoji} ${t(`status.${ws.key}`)}`}
                    sx={{ ml: 0.75, height: 20, fontSize: 11, fontWeight: 700 }} />
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {t(`activity.${item.kind}`)}
                {item.author ? ` · @${item.author}` : ` · ${t('activity.anon')}`}
                {item.region ? ` · ${item.region}` : ''}
                {' · '}{timeAgo(item.createdAt, t)}
              </Typography>
              {item.text && (
                <Typography variant="body2" color="text.secondary"
                  sx={{ mt: 0.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  “{item.text}”
                </Typography>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
