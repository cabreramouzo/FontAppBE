import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
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
import { CoverageBar } from '../components/CoverageBar'
import { TODOS, nombrePais, paisRecordado, paisesDe, recuerdaPais } from '../lib/countries'
import { LocalGoalCard } from '../components/LocalGoalCard'
import { Skeleton } from '../components/Skeleton'

/**
 * Las zonas. Fase 5 del plan (docs/gamificacion.md).
 *
 * El orden de la página es la mitad del diseño: **primero las barras de la demarcación y
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

  // Tres fuentes para el país, en este orden: lo que elegiste (gana siempre y para
  // siempre), dónde estás, y si no se sabe ninguna de las dos, todos.
  //
  // Que la elección explícita gane a la ubicación es lo que hace que el automatismo no
  // moleste: alguien que está en Francia mirando España a propósito no quiere que la
  // página se lo deshaga en cada visita.
  const [pais, setPais] = useState<string | null>(paisRecordado)

  function elige(p: string) {
    setPais(p)
    recuerdaPais(p)
  }

  /** Lo dice la tarjeta de tu entorno. Solo vale si aún no habías elegido tú. */
  const desdeTuUbicacion = useCallback((suyo: string | null) => {
    if (!suyo) return
    setPais((actual) => actual ?? suyo)
  }, [])

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

  const paises = zonas ? paisesDe(zonas) : []
  // Un país recordado que ya no está en los datos (o el `*`) no filtra nada, así que se
  // ve todo. Es preferible a no enseñar ninguna zona y parecer que la página está rota.
  const filtra = pais !== null && pais !== TODOS && paises.includes(pais)
  const visibles = filtra ? (zonas ?? []).filter((z) => z.country === pais) : (zonas ?? [])

  return (
    <Box className="pad" sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>🗺️ {t('zones.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('zones.intro')}</Typography>

      {/* Primero lo que se puede terminar y después lo que no. Al revés, la página
          abría con una barra al 0,3 % que no se mueve en meses. */}
      <LocalGoalCard onCountry={desdeTuUbicacion} />

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

      {/* El selector va **encima** del rótulo «por demarcación», no debajo. Debajo
          parecía que el rótulo nombraba los chips —y entonces sí habría que llamarlo
          «por país»—, cuando lo que nombra es la lista de tarjetas, que son
          demarcaciones y no países. El orden cuenta la verdad: eliges país y dentro
          ves sus demarcaciones.
          Y solo aparece si hay entre qué elegir: con un solo país es un control que no
          hace nada y que además miente sobre el alcance de la app. */}
      {estado === 'ok' && paises.length > 1 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, overflowX: 'auto', pb: 0.5,
                   // Que la fila se pueda arrastrar en móvil sin cortar el chip de la
                   // punta contra el borde de la pantalla.
                   mx: -2, px: 2, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {paises.map((p) => (
            <Chip
              key={p}
              label={nombrePais(p, t)}
              onClick={() => elige(p)}
              color={pais === p ? 'primary' : 'default'}
              variant={pais === p ? 'filled' : 'outlined'}
              sx={{ flexShrink: 0 }}
            />
          ))}
          <Chip
            label={t('zones.allCountries')}
            onClick={() => elige(TODOS)}
            color={pais === TODOS || pais === null ? 'primary' : 'default'}
            variant={pais === TODOS || pais === null ? 'filled' : 'outlined'}
            sx={{ flexShrink: 0 }}
          />
        </Box>
      )}

      {estado === 'ok' && !!visibles.length && (
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 0.5 }}>
          {t('zones.byRegion')}
        </Typography>
      )}
      {estado === 'ok' && visibles.map((z) => <ZonaCard key={`${z.country}/${z.region}`} zona={z} lang={lang} />)}
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

        <CoverageBar
          icon={<PhotoCameraOutlinedIcon fontSize="small" />}
          label={t('zones.withPhoto')}
          hint={t('zones.withPhotoHint')}
          done={zona.withPhoto}
          total={zona.fonts}
          pct={zona.photoPct}
          lang={lang}
        />
        <CoverageBar
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
