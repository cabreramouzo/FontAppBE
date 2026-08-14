import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { assetUrl, getActivity, type ActivityItem } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'

// Ilustración de la app para las tarjetas sin foto. La mayoría de fuentes vienen
// importadas y aún no tienen ninguna: sin esto la rejilla saldría medio vacía y
// desigual, que es justo lo que una rejilla no perdona.
const SIN_FOTO = '/welcome.jpg'

// Encuadre de la ilustración de relleno, distinto para cada fuente. Con el mismo
// recorte en todas, media rejilla parecían tarjetas duplicadas.
function encuadre(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return `${15 + (h % 70)}% ${25 + ((h >> 8) % 50)}%`
}

const KIND_EMOJI: Record<ActivityItem['kind'], string> = {
  fontAdded: '➕',
  review: '💬',
  report: '⚠️',
  edit: '✏️',
}

function Tarjeta({ item }: { item: ActivityItem }) {
  const { t } = useI18n()
  const ws = item.waterStatus ? waterStatusInfo(item.waterStatus) : null
  const propia = !!item.image
  const esAviso = item.kind === 'report'

  return (
    <Card
      elevation={0}
      sx={(theme) => ({
        borderRadius: 4,
        overflow: 'hidden',
        border: 1,
        borderColor: esAviso ? alpha(theme.palette.warning.main, 0.5) : 'divider',
        transition: 'transform .15s ease, box-shadow .15s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
      })}
    >
      <CardActionArea component={RouterLink} to={`/fonts/${item.fontID}`} sx={{ display: 'block' }}>
        {/* Cuadrado: la rejilla se lee de un vistazo solo si todas las piezas miden
            igual, tenga la foto la forma que tenga. */}
        <Box sx={{ position: 'relative', aspectRatio: '1 / 1', overflow: 'hidden' }}>
          <Box
            component="img"
            src={propia ? assetUrl(item.image as string) : SIN_FOTO}
            alt=""
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              // La ilustración de relleno se apaga y se recorta distinto en cada
              // tarjeta: ni compite con las fotos reales, ni aparenta que esa fuente
              // ya tiene una, ni se ve como la misma imagen repetida veinte veces.
              ...(propia
                ? {}
                : { filter: 'saturate(0.55) brightness(0.62)', objectPosition: encuadre(item.fontID) }),
            }}
          />
          {/* Degradado inferior para que el texto blanco se lea sobre cualquier foto. */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: propia
                ? 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 42%, rgba(0,0,0,0) 68%)'
                : 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.1) 100%)',
            }}
          />
          <Chip
            size="small"
            label={`${KIND_EMOJI[item.kind]} ${t(`activity.${item.kind}`)}`}
            sx={(theme) => ({
              position: 'absolute',
              top: 10,
              left: 10,
              height: 24,
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              bgcolor: esAviso ? theme.palette.warning.dark : alpha('#000', 0.55),
              backdropFilter: 'blur(4px)',
            })}
          />
          {ws && (
            <Chip
              size="small"
              label={`${ws.emoji} ${t(`status.${ws.key}`)}`}
              sx={{
                position: 'absolute',
                top: 10,
                right: 10,
                height: 24,
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                bgcolor: alpha('#000', 0.55),
                backdropFilter: 'blur(4px)',
              }}
            />
          )}
          <Box sx={{ position: 'absolute', left: 12, right: 12, bottom: 10, color: '#fff' }}>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: 15,
                lineHeight: 1.25,
                textShadow: '0 1px 3px rgba(0,0,0,.6)',
                // Dos líneas como mucho: hay topónimos larguísimos y si no, la
                // tarjeta crecería y rompería la rejilla.
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.fontName}
            </Typography>
            <Typography sx={{ fontSize: 12, opacity: 0.85, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
              {timeAgo(item.createdAt, t)}
              {item.author ? ` · ${item.author}` : ''}
              {item.region ? ` · ${item.region}` : ''}
            </Typography>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  )
}

/**
 * Novedades en rejilla: lo último que ha pasado, con foto y en cuadrados iguales.
 *
 * Complementa a `ActivityFeed`, que es la misma información en lista: la lista sirve
 * para revisar, esta para mirar. Comparten el endpoint `/activity`.
 */
export function ActivityGrid({ limit = 24, showFilter = false }: { limit?: number; showFilter?: boolean }) {
  const { t } = useI18n()
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [region, setRegion] = useState('')

  useEffect(() => {
    setItems(null)
    getActivity({ limit, region: region || undefined }).then(setItems).catch(() => setItems([]))
  }, [limit, region])

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

      <Box
        sx={{
          display: 'grid',
          // `auto-fill` con un mínimo: las columnas las decide el ancho disponible,
          // así que sirve igual en un móvil (2) que en un escritorio ancho (5-6).
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: { xs: 1.25, sm: 2 },
        }}
      >
        {items === null &&
          // Huecos del mismo tamaño mientras carga: la rejilla no da saltos al llegar.
          Array.from({ length: 8 }).map((_, i) => (
            <Box key={i} sx={{ aspectRatio: '1 / 1', borderRadius: 4, bgcolor: 'action.hover' }} />
          ))}
        {items?.map((item, i) => (
          <Tarjeta key={`${item.kind}-${item.fontID}-${item.createdAt}-${i}`} item={item} />
        ))}
      </Box>

      {items?.length === 0 && <Typography color="text.secondary">{t('activity.empty')}</Typography>}
    </Box>
  )
}
