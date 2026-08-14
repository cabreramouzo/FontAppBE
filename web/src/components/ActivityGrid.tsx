import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { alpha, useTheme } from '@mui/material/styles'
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

/**
 * Tamaño de cada pieza, en columnas × filas. Mezclar formatos es lo que le da el aire
 * de portada de periódico; hacerlo al azar, en cambio, se nota y marea, así que el
 * reparto es fijo y depende solo de la posición y de si hay foto de verdad.
 *
 * Las piezas grandes se reservan a las que traen foto propia: ampliar la ilustración
 * de relleno a doble tamaño solo consigue que se vea que es de relleno.
 *
 * En móvil solo hay dos columnas, así que una pieza "apaisada" sería la pantalla
 * entera: ahí se queda únicamente la de apertura y el resto varía solo de alto.
 */
function pieza(item: ActivityItem, i: number, compacto: boolean): { cols: number; filas: number } {
  const conFoto = !!item.image
  if (i === 0 && conFoto) return { cols: 2, filas: 3 }                 // la apertura
  if (conFoto && !compacto && i % 7 === 3) return { cols: 2, filas: 2 } // apaisada
  if (i % 5 === 2) return { cols: 1, filas: 3 }                         // vertical
  return { cols: 1, filas: 2 }                                          // cuadrada
}

const KIND_EMOJI: Record<ActivityItem['kind'], string> = {
  fontAdded: '➕',
  review: '💬',
  report: '⚠️',
  edit: '✏️',
}

function Tarjeta({ item, cols, filas }: { item: ActivityItem; cols: number; filas: number }) {
  const { t } = useI18n()
  const ws = item.waterStatus ? waterStatusInfo(item.waterStatus) : null
  const propia = !!item.image
  const esAviso = item.kind === 'report'
  // Piezas con sitio de sobra para la firma completa.
  const grande = cols > 1 || filas > 2

  return (
    <Card
      elevation={0}
      sx={(theme) => ({
        gridColumn: `span ${cols}`,
        gridRow: `span ${filas}`,
        borderRadius: 4,
        overflow: 'hidden',
        border: 1,
        borderColor: esAviso ? alpha(theme.palette.warning.main, 0.5) : 'divider',
        transition: 'transform .15s ease, box-shadow .15s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
      })}
    >
      <CardActionArea component={RouterLink} to={`/fonts/${item.fontID}`} sx={{ display: 'block', height: '100%' }}>
        {/* La altura la marca la rejilla, no la foto: `cover` recorta lo que sobre. */}
        <Box sx={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
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
                fontSize: cols > 1 ? 20 : 15,
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
            {/* En las piezas pequeñas solo la fecha: el nombre de la fuente es lo que
                hay que poder leer, y con la firma detrás no cabían los dos. En una
                línea siempre, para que el bloque no crezca y choque con el chip. */}
            <Typography
              noWrap
              sx={{ fontSize: 12, opacity: 0.85, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}
            >
              {timeAgo(item.createdAt, t)}
              {grande && item.author ? ` · ${item.author}` : ''}
              {grande && item.region ? ` · ${item.region}` : ''}
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
  const theme = useTheme()
  const compacto = useMediaQuery(theme.breakpoints.down('sm'))
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
          // Número fijo de columnas por tamaño de pantalla (no `auto-fill`): las piezas
          // ocupan dos columnas y hay que saber cuántas hay para que quepan.
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' },
          // Filas bajas: las piezas ocupan 2 o 3, y de ahí salen las proporciones.
          gridAutoRows: { xs: '66px', sm: '64px', md: '72px' },
          // `dense` rellena los huecos que dejan las piezas grandes al no caber en su
          // sitio. Sin esto el mosaico sale agujereado.
          gridAutoFlow: 'dense',
          gap: { xs: 1.25, sm: 2 },
        }}
      >
        {items === null &&
          // Huecos del mismo tamaño mientras carga: la rejilla no da saltos al llegar.
          Array.from({ length: 10 }).map((_, i) => (
            <Box
              key={i}
              sx={{
                gridColumn: `span ${i === 0 ? 2 : 1}`,
                gridRow: `span ${i === 0 ? 3 : i % 5 === 2 ? 3 : 2}`,
                borderRadius: 4,
                bgcolor: 'action.hover',
              }}
            />
          ))}
        {items?.map((item, i) => {
          const { cols, filas } = pieza(item, i, compacto)
          return (
            <Tarjeta
              key={`${item.kind}-${item.fontID}-${item.createdAt}-${i}`}
              item={item}
              cols={cols}
              filas={filas}
            />
          )
        })}
      </Box>

      {items?.length === 0 && <Typography color="text.secondary">{t('activity.empty')}</Typography>}
    </Box>
  )
}
