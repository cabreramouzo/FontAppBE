import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Collapse from '@mui/material/Collapse'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { getZoneRanking, getZones } from '../api/client'
import type { ZoneCoverage, ZoneRanking } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'

/**
 * Las zonas. Fase 5 del plan (docs/gamificacion.md).
 *
 * El orden de la página es la mitad del diseño: **primero las barras de la comarca y
 * después la tabla del mes**. A mucha gente los rankings le dan reparo, y en una app de
 * colaboración ciudadana espantarlos sale carísimo. Quien no quiera competir se lleva
 * igualmente lo que ha venido a ver, porque la barra es del territorio y no de nadie.
 *
 * Por eso también la tabla va plegada: hay que ir a buscarla.
 */
export function ZonesPage() {
  const { t, lang } = useI18n()
  const [zonas, setZonas] = useState<ZoneCoverage[] | null>(null)
  const [estado, setEstado] = useState<'loading' | 'ok' | 'error'>('loading')

  const cargar = useCallback(async () => {
    setEstado('loading')
    try {
      setZonas((await getZones()).zones)
      setEstado('ok')
    } catch {
      setEstado('error')
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { document.title = `${t('zones.title')} · FontApp` }, [t])

  return (
    <Box className="pad" sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>🗺️ {t('zones.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('zones.intro')}</Typography>

      {estado === 'loading' && <Skeleton lines={6} />}

      {/* Un fallo de carga no se enseña como «no hay zonas»: confundirlos haría creer
          que el mapa está sin clasificar cuando lo que ha fallado es la petición. */}
      {estado === 'error' && (
        <Alert
          severity="warning"
          action={<Button size="small" onClick={() => void cargar()}>{t('zones.retry')}</Button>}
        >
          {t('zones.failed')}
        </Alert>
      )}

      {estado === 'ok' && zonas?.length === 0 && (
        <Alert severity="info">{t('zones.none')}</Alert>
      )}

      {estado === 'ok' && zonas?.map((z) => <ZonaCard key={z.region} zona={z} lang={lang} />)}
    </Box>
  )
}

function ZonaCard({ zona, lang }: { zona: ZoneCoverage; lang: string }) {
  const { t } = useI18n()
  const [abierta, setAbierta] = useState(false)

  return (
    <Card variant="outlined" sx={{ mb: 1.5, borderRadius: 2 }}>
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem' }}>{zona.region}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('zones.fonts', { n: zona.fonts.toLocaleString(lang) })}
          </Typography>
        </Box>

        <Barra
          icon={<PhotoCameraOutlinedIcon fontSize="small" />}
          label={t('zones.withPhoto')}
          hint={t('zones.withPhotoHint')}
          done={zona.withPhoto}
          total={zona.fonts}
          pct={zona.photoPct}
          lang={lang}
        />
        <Barra
          icon={<EventAvailableOutlinedIcon fontSize="small" />}
          label={t('zones.checked')}
          hint={t('zones.checkedHint')}
          done={zona.checkedRecently}
          total={zona.fonts}
          pct={zona.freshPct}
          lang={lang}
        />
      </Box>

      <CardActionArea onClick={() => setAbierta((v) => !v)} sx={{ px: 2, py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('zones.monthTable')}</Typography>
          <ExpandMoreIcon
            fontSize="small"
            sx={{ transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
          />
        </Box>
      </CardActionArea>

      <Collapse in={abierta} unmountOnExit>
        <Tabla region={zona.region} lang={lang} />
      </Collapse>
    </Card>
  )
}

function Barra({ icon, label, hint, done, total, pct, lang }: {
  icon: React.ReactNode
  label: string
  hint: string
  done: number
  total: number
  pct: number
  lang: string
}) {
  const { t } = useI18n()
  return (
    <Box sx={{ mb: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
        <Box sx={{ display: 'flex', color: 'text.secondary' }}>{icon}</Box>
        <Tooltip title={hint}>
          <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>{label}</Typography>
        </Tooltip>
        {/* El porcentaje y el recuento juntos: «2 %» sobre 2 622 fuentes suena a nada,
            y «52 fuentes» sin el total suena a mucho. Ninguno de los dos solo es honesto. */}
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {t('zones.ofTotal', { n: done.toLocaleString(lang), m: total.toLocaleString(lang), p: String(pct) })}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        // Un 0,4 % redondea a 0 y la barra desaparece del todo, que se lee como «esta
        // comarca no existe». Se le deja un hilo visible mientras haya algo.
        value={Math.max(pct, done > 0 ? 1.5 : 0)}
        sx={{
          height: 8,
          borderRadius: 4,
          // El carril por defecto de MUI es el primario aclarado, un azul bastante
          // saturado: con estos porcentajes —del 0 al 2 %— la barra vacía se leía como
          // una barra LLENA, que es justo lo contrario de lo que dice el dato. Carril
          // neutro y relleno azul, o el gráfico miente de un vistazo.
          bgcolor: 'action.selected',
          '& .MuiLinearProgress-bar': { borderRadius: 4 },
        }}
      />
    </Box>
  )
}

function Tabla({ region, lang }: { region: string; lang: string }) {
  const { t } = useI18n()
  const [datos, setDatos] = useState<ZoneRanking | null>(null)
  const [estado, setEstado] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await getZoneRanking(region)
        if (vivo) { setDatos(r); setEstado('ok') }
      } catch {
        if (vivo) setEstado('error')
      }
    })()
    return () => { vivo = false }
  }, [region])

  if (estado === 'loading') return <Box sx={{ px: 2, pb: 2 }}><Skeleton lines={3} /></Box>
  if (estado === 'error') {
    return <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>{t('zones.failed')}</Typography>
  }
  if (!datos?.rows.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>{t('zones.noRanking')}</Typography>
  }

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('zones.monthHint')}
      </Typography>
      {datos.rows.map((r) => (
        <Box
          key={r.username}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1, py: 0.6,
            borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          <Typography
            variant="body2"
            sx={{ width: 24, textAlign: 'right', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
          >
            {r.rank}
          </Typography>
          <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0, fontWeight: 600 }} noWrap>
            {r.username}
          </Typography>
          <Tooltip title={t('game.gotes')}>
            <Chip
              label={r.gotes.toLocaleString(lang)}
              size="small"
              sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            />
          </Tooltip>
        </Box>
      ))}
    </Box>
  )
}
