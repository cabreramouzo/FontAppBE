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
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt'
import MapIcon from '@mui/icons-material/Map'
import RefreshIcon from '@mui/icons-material/Refresh'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import { alpha, useTheme } from '@mui/material/styles'
import { assetUrl, getActivity, type ActivityItem } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'
import { askPosition, positionIfAllowed } from '../lib/quietPosition'
import { DryFountain } from './DryFountain'
import { useToast } from './ToastContext'

// Radio de las esquinas de las piezas. En px y no con la escala del tema (`4` serían
// 48 px, cuatro veces `shape.borderRadius`): estas tarjetas son pequeñas y con tanto
// redondeo se comían la foto por las esquinas.
// Lo usan la tarjeta Y el hueco gris de carga; si se separan, la rejilla cambia de
// forma al llegar los datos.
const RADIO = '15px'

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

/** Texto de la novedad, limpio: descripción, reseña o incidencia, sin espacios sueltos. */
function textoDe(item: ActivityItem): string {
  return (item.text ?? '').trim()
}

/**
 * Tamaño de cada pieza, en columnas × filas (cada fila mide ~70 px).
 *
 * Manda lo que hay que contar: una reseña larga necesita sitio para leerse, y una
 * fuente importada que solo trae el nombre no. Mezclar formatos es lo que le da el
 * aire de portada; hacerlo al azar se nota y marea, así que el reparto es fijo — el
 * mismo elemento sale siempre igual, aunque se filtre o se recargue.
 *
 * En móvil solo hay dos columnas, así que una pieza "apaisada" sería la pantalla
 * entera: ahí se queda únicamente la de apertura y el resto varía solo de alto.
 */
function pieza(item: ActivityItem, i: number, compacto: boolean): { cols: number; filas: number } {
  const conFoto = !!item.image
  const texto = textoDe(item).length

  // TODAS las alturas son múltiplos de dos filas, y no por capricho: mezclando 2 y 3
  // quedaban huecos de una sola fila que ninguna pieza podía tapar, porque la más
  // pequeña ya mide dos. Con 2 y 4, cualquier hueco admite una pieza pequeña y el
  // empaquetado denso lo rellena.
  if (texto >= 140) return { cols: 2, filas: 4 }                         // párrafo
  if (i === 0 && conFoto) return { cols: 2, filas: 4 }                   // la apertura
  if (conFoto && !compacto && i % 7 === 3) return { cols: 2, filas: 2 }  // apaisada
  if (texto >= 60) return { cols: 1, filas: 4 }                          // algo que leer
  if (i % 5 === 2) return { cols: 1, filas: 4 }                          // vertical
  return { cols: 1, filas: 2 }                                           // pequeña
}

const KIND_EMOJI: Record<ActivityItem['kind'], string> = {
  fontAdded: '➕',
  review: '💬',
  report: '⚠️',
  edit: '✏️',
}

function Tarjeta({ item, cols, filas }: { item: ActivityItem; cols: number; filas: number }) {
  const { t } = useI18n()
  // Una foto que no carga (borrada del almacén, red caída) dejaba la tarjeta en blanco
  // con el texto blanco encima: ilegible. Si falla, se cae a la ilustración de relleno.
  const [falla, setFalla] = useState(false)
  const ws = item.waterStatus ? waterStatusInfo(item.waterStatus) : null
  const propia = !!item.image && !falla
  const esAviso = item.kind === 'report'
  // Piezas con sitio de sobra para la firma completa.
  const grande = cols > 1 || filas > 2
  // El extracto solo donde de verdad cabe: en una pieza pequeña serían dos palabras
  // y un puntito, que no informa de nada y quita aire al nombre.
  const texto = textoDe(item)
  // Pieza de una sola columna: no hay sitio para las dos etiquetas completas.
  const estrecho = cols === 1
  const conExtracto = filas >= 4 && texto.length > 0

  return (
    <Card
      elevation={0}
      sx={(theme) => ({
        gridColumn: `span ${cols}`,
        gridRow: `span ${filas}`,
        borderRadius: RADIO,
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
            onError={() => setFalla(true)}
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
              // El velo va fuerte al pie a propósito: hay fotos claras (nieve, cielo,
              // piedra al sol) sobre las que el texto blanco desaparece, y no se puede
              // saber de antemano cuál toca. Con extracto sube más, o las últimas
              // líneas del párrafo se salen de la zona protegida.
              background: conExtracto
                ? 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 32%, rgba(0,0,0,0.3) 62%, rgba(0,0,0,0) 88%)'
                : 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.55) 32%, rgba(0,0,0,0) 72%)',
            }}
          />
          {/* Los dos distintivos van en una MISMA fila, no colocados cada uno por su
              cuenta en una esquina: así no pueden solaparse por estrecha que sea la
              pieza. En las de una columna el tipo se queda en el emoji — el estado del
              agua es el dato que hay que poder leer, y las dos etiquetas juntas no
              caben en 150 px. */}
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              left: 10,
              right: 10,
              display: 'flex',
              gap: 0.75,
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <Chip
              size="small"
              label={estrecho ? KIND_EMOJI[item.kind] : `${KIND_EMOJI[item.kind]} ${t(`activity.${item.kind}`)}`}
              sx={(theme) => ({
                flexShrink: 0,
                height: 24,
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                bgcolor: esAviso ? theme.palette.warning.dark : alpha('#000', 0.55),
                backdropFilter: 'blur(4px)',
                '& .MuiChip-label': { px: estrecho ? 0.5 : 0.75 },
              })}
            />
            {ws && (
              <Chip
                size="small"
                label={`${ws.emoji} ${t(`status.${ws.key}`)}`}
                sx={{
                  height: 24,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  bgcolor: alpha('#000', 0.55),
                  backdropFilter: 'blur(4px)',
                  // Si aun así no cabe, se recorta el estado antes que desbordar.
                  minWidth: 0,
                  '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' },
                }}
              />
            )}
          </Box>
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
            {conExtracto && (
              <Typography
                sx={{
                  fontSize: 13,
                  lineHeight: 1.35,
                  opacity: 0.92,
                  mt: 0.5,
                  textShadow: '0 1px 3px rgba(0,0,0,.6)',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {texto}
              </Typography>
            )}
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
  const { show } = useToast()
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  // Un fallo de carga NO es una zona tranquila. Se distinguen porque el remedio es el
  // contrario: ante un error hay que reintentar, y ante una zona vacía, traer gente.
  const [fallo, setFallo] = useState(false)
  const [intento, setIntento] = useState(0)
  const [region, setRegion] = useState('')
  const [pos, setPos] = useState<[number, number] | null>(null)
  // Arranca en "cerca de mí" y cae a "todo" si no hay ubicación: una portada global es
  // casi inútil para quien vive lejos de donde se mueve la cosa.
  const [cerca, setCerca] = useState(true)
  const [ubicando, setUbicando] = useState(true)

  // Al montar, la posición solo si el permiso YA estaba dado (ver `positionIfAllowed`).
  useEffect(() => {
    let vivo = true
    positionIfAllowed().then((p) => {
      if (!vivo) return
      setPos(p)
      if (!p) setCerca(false)
      setUbicando(false)
    })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (ubicando) return
    setItems(null)
    setFallo(false)
    const zona = cerca && pos ? { lat: pos[0], long: pos[1] } : {}
    getActivity({ limit, region: cerca ? undefined : region || undefined, ...zona })
      .then(setItems)
      .catch(() => {
        setFallo(true)
        setItems([])
      })
  }, [limit, region, cerca, pos, ubicando, intento])

  /**
   * Invitar: la hoja de compartir del sistema si la hay, y si no, el enlace al
   * portapapeles. Sin depender de ninguna red social concreta.
   */
  async function invitar() {
    const url = `${location.origin}/?p=invite`
    const texto = t('activity.inviteText')
    try {
      if (navigator.share) {
        await navigator.share({ title: 'FontApp', text: texto, url })
        return
      }
      await navigator.clipboard.writeText(`${texto} ${url}`)
      show(t('activity.inviteCopied'))
    } catch {
      // El usuario ha cancelado la hoja de compartir: no hay nada que avisar.
    }
  }

  /** "Cerca de mí" pulsado sin tener posición: ahí sí se puede pedir permiso. */
  async function activarCerca() {
    if (pos) { setCerca(true); return }
    const p = await askPosition()
    if (!p) { show(t('map.geoFailed')); return }
    setPos(p)
    setCerca(true)
  }

  const regions = [...new Set((items ?? []).map((i) => i.region).filter(Boolean))] as string[]

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}>
        <Chip
          clickable
          icon={<MyLocationIcon />}
          label={t('activity.nearMe')}
          color={cerca ? 'primary' : 'default'}
          variant={cerca ? 'filled' : 'outlined'}
          onClick={activarCerca}
        />
        <Chip
          clickable
          label={t('activity.everywhere')}
          color={!cerca ? 'primary' : 'default'}
          variant={!cerca ? 'filled' : 'outlined'}
          onClick={() => setCerca(false)}
        />
        {/* La región solo tiene sentido mirando el global: con "cerca de mí" el
            recorte ya lo dan las coordenadas, y dos filtros de zona a la vez confunden. */}
        {showFilter && !cerca && regions.length > 1 && (
          <TextField
            select size="small" label={t('activity.region')} value={region}
            onChange={(e) => setRegion(e.target.value)} sx={{ minWidth: 180 }}
          >
            <MenuItem value="">{t('activity.allRegions')}</MenuItem>
            {regions.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
        )}
      </Stack>

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
                gridRow: `span ${i === 0 || i % 5 === 2 ? 4 : 2}`,
                borderRadius: RADIO,
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

      {/* Se ha caído la petición: decirlo y ofrecer reintentar. Antes esto enseñaba la
          fuente seca invitando a traer amigos, que es el mensaje justo al revés — no
          había nada que enseñar porque el servidor no contestó, no porque la zona esté
          tranquila. */}
      {fallo && (
        <DryFountain title={t('activity.errorTitle')} subtitle={t('activity.errorBody')}>
          <Button variant="contained" disableElevation startIcon={<RefreshIcon />} onClick={() => setIntento((n) => n + 1)}>
            {t('activity.retry')}
          </Button>
        </DryFountain>
      )}

      {!fallo && items?.length === 0 && (
        <DryFountain
          title={t(cerca ? 'activity.emptyNearTitle' : 'activity.emptyTitle')}
          subtitle={t(cerca ? 'activity.emptyNearBody' : 'activity.emptyBody')}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'center' }}>
            <Button variant="contained" disableElevation startIcon={<PersonAddAltIcon />} onClick={invitar}>
              {t('activity.invite')}
            </Button>
            <Button component={RouterLink} to="/" startIcon={<MapIcon />}>
              {t('activity.toMap')}
            </Button>
          </Stack>
        </DryFountain>
      )}
    </Box>
  )
}
