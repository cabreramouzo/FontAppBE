import { SaveZoneButton, SavedOuting } from '../components/SavedOuting'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Collapse from '@mui/material/Collapse'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import { getPlaces, getZonePending, getZoneRanking, getZones, type PlaceDTO } from '../api/client'
import type { ZoneCoverage, ZonePendingFont, ZoneRanking } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { CoverageBar } from '../components/CoverageBar'
import { TODOS, nombrePais, paisRecordado, paisesDe, recuerdaPais } from '../lib/countries'
import { LocalGoalCard } from '../components/LocalGoalCard'
import { Skeleton } from '../components/Skeleton'
import { admin1Name } from '../lib/admin1'
import { nombreFuente } from '../lib/fontName'

type SearchOption =
  | { kind: 'region'; label: string; region: string; detail: string }
  | { kind: 'place'; label: string; place: PlaceDTO; detail: string }

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
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [zonas, setZonas] = useState<ZoneCoverage[] | null>(null)
  const [estado, setEstado] = useState<'loading' | 'ok' | 'error'>('loading')

  // Tres fuentes para el país, en este orden: lo que elegiste (gana siempre y para
  // siempre), dónde estás, y si no se sabe ninguna de las dos, todos.
  //
  // Que la elección explícita gane a la ubicación es lo que hace que el automatismo no
  // moleste: alguien que está en Francia mirando España a propósito no quiere que la
  // página se lo deshaga en cada visita.
  const [pais, setPais] = useState<string | null>(paisRecordado)
  const [busqueda, setBusqueda] = useState('')
  useEffect(() => {
    const region = params.get('region')
    if (region) { setBusqueda(region); setPais(params.get('country') ?? TODOS) }
  }, [params])
  const [lugares, setLugares] = useState<PlaceDTO[]>([])
  const [buscando, setBuscando] = useState(false)

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
  const delPais = filtra ? (zonas ?? []).filter((z) => z.country === pais) : (zonas ?? [])
  const aguja = busqueda.trim().toLocaleLowerCase(lang)
  const visibles = aguja
    ? delPais.filter((z) => `${z.region} ${z.admin1 ? admin1Name(z.admin1) : ''}`.toLocaleLowerCase(lang).includes(aguja))
    : delPais

  useEffect(() => {
    if (busqueda.trim().length < 2) { setLugares([]); setBuscando(false); return }
    let active = true
    const timer = window.setTimeout(() => {
      setBuscando(true)
      getPlaces({ q: busqueda.trim(), country: filtra ? pais! : undefined, limit: 8 })
        .then((items) => { if (active) setLugares(items) })
        .catch(() => { if (active) setLugares([]) })
        .finally(() => { if (active) setBuscando(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [busqueda, filtra, pais])

  const opciones = useMemo<SearchOption[]>(() => {
    const regiones: SearchOption[] = delPais
      .filter((z) => !aguja || `${z.region} ${z.admin1 ? admin1Name(z.admin1) : ''}`.toLocaleLowerCase(lang).includes(aguja))
      .slice(0, 8)
      .map((z) => ({ kind: 'region', label: z.region, region: z.region, detail: z.admin1 ? admin1Name(z.admin1) : (z.country ? nombrePais(z.country, t) : t('zones.otherRegions')) }))
    const places: SearchOption[] = lugares.map((place) => ({
      kind: 'place', label: place.name, place,
      detail: [place.region, place.country ? nombrePais(place.country, t) : null].filter(Boolean).join(' · '),
    }))
    return [...regiones, ...places]
  }, [aguja, delPais, lang, lugares, t])
  const admin1Counts = new Map<string, number>()
  for (const z of visibles) if (z.admin1) admin1Counts.set(z.admin1, (admin1Counts.get(z.admin1) ?? 0) + 1)
  const agrupa = [...admin1Counts.values()].some((n) => n > 1)
  const grupos = agrupa
    ? [...new Set(visibles.map((z) => z.admin1 ?? ''))].map((code) => ({
        code,
        zones: visibles.filter((z) => (z.admin1 ?? '') === code),
      }))
    : []

  return (
    // 1200 y no 900: esta página son tarjetas, no prosa, y el ancho de una página lo
    // decide lo que contiene. Con 900 las 53 demarcaciones caían en una sola columna y
    // la página medía 11,9 pantallas de scroll en un portátil de 1440, con 540 px de
    // blanco al lado de cada tarjeta. La cabecera sí es prosa y se queda acotada.
    <Box className="pad" sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>🗺️ {t('zones.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: '68ch' }}>{t('zones.intro')}</Typography>

      {/* Primero lo que se puede terminar y después lo que no. Al revés, la página
          abría con una barra al 0,3 % que no se mueve en meses. */}
      <SavedOuting />
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

      {estado === 'ok' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(180px, 240px) minmax(280px, 460px)' }, gap: 1, mb: 2, alignItems: 'start' }}>
          {paises.length > 1 && (
            <TextField select size="small" label={t('activity.country')} value={filtra ? pais : TODOS}
              onChange={(e) => { elige(e.target.value); setBusqueda('') }} fullWidth>
              <MenuItem value={TODOS}>{t('zones.allCountries')}</MenuItem>
              {paises.map((p) => <MenuItem key={p} value={p}>{nombrePais(p, t)}</MenuItem>)}
            </TextField>
          )}
          <Autocomplete<SearchOption, false, false, true>
            freeSolo loading={buscando} options={opciones} filterOptions={(items) => items}
            inputValue={busqueda}
            getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
            isOptionEqualToValue={(a, b) => typeof b !== 'string' && a.kind === b.kind && (a.kind === 'region' ? a.region === (b as Extract<SearchOption, { kind: 'region' }>).region : a.place.slug === (b as Extract<SearchOption, { kind: 'place' }>).place.slug)}
            onInputChange={(_, value) => setBusqueda(value)}
            onChange={(_, option) => {
              if (!option || typeof option === 'string') return
              if (option.kind === 'place') navigate(`/places/${option.place.slug}`)
              else setBusqueda(option.region)
            }}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={`${option.kind}/${option.kind === 'region' ? option.region : option.place.slug}`}>
                <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{option.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{option.kind === 'place' ? t('zones.locality') : t('zones.region')} · {option.detail}</Typography></Box>
              </Box>
            )}
            renderInput={(params) => <TextField {...params} size="small" label={t('zones.search')} placeholder={t('zones.searchPlaceholder')} />}
            sx={{ gridColumn: paises.length > 1 ? undefined : '1 / -1', maxWidth: 460 }}
          />
        </Box>
      )}

      {estado === 'ok' && !!visibles.length && (
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 0.5 }}>
          {t('zones.byRegion')}
        </Typography>
      )}
      {/* Rejilla que se cuenta sola: `auto-fill` reparte tantas columnas como quepan a
          partir de 360 px, así que no hay puntos de corte escritos a mano que se queden
          viejos al cambiar el contenido de la tarjeta. En un portátil de 1440 salen tres.
          El mínimo son 360 y no 320 **porque está medido en euskera**, que es el idioma
          más largo: a 325 px de tarjeta, 49 de las filas de cobertura se partían en dos
          líneas. Un mínimo elegido en castellano habría dejado la página rota en un
          idioma que no se mira.
          `auto-fill` y no `auto-fit` a propósito: con `auto-fit`, filtrar por un país de
          una sola demarcación estiraría esa tarjeta a los 1200 px de ancho.
          `alignItems: start` es lo que evita que desplegar la tabla de una tarjeta estire
          a sus vecinas de la misma fila hasta su alto. */}
      {estado === 'ok' && !agrupa && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 1.5,
            alignItems: 'start',
          }}
        >
          {visibles.map((z) => <ZonaCard key={`${z.country}/${z.region}`} zona={z} lang={lang} />)}
        </Box>
      )}
      {estado === 'ok' && aguja && visibles.length === 0 && (
        <Alert severity="info">{t('zones.noSearchResults')}</Alert>
      )}
      {estado === 'ok' && agrupa && grupos.map((grupo) => (
        <Box key={grupo.code || 'unknown'} sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {grupo.code ? admin1Name(grupo.code) : t('zones.otherRegions')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 1.5, alignItems: 'start' }}>
            {grupo.zones.map((z) => <ZonaCard key={`${z.country}/${z.region}`} zona={z} lang={lang} />)}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function ZonaCard({ zona, lang }: { zona: ZoneCoverage; lang: string }) {
  const { t } = useI18n()
  const [abierta, setAbierta] = useState(false)

  return (
    // Sin `mb`: la separación la pone el `gap` de la rejilla, y con las dos cosas las
    // filas quedaban más separadas que las columnas.
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
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
        <SaveZoneButton zone={{ kind: 'region', name: zona.region, country: zona.country ?? null }} />
        {zona.fonts > zona.checkedRecently && (
          <Pendientes zona={zona} lang={lang} />
        )}
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

function Pendientes({ zona, lang }: { zona: ZoneCoverage; lang: string }) {
  const { t } = useI18n()
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<ZonePendingFont[] | null>(null)
  const [error, setError] = useState(false)
  const total = zona.fonts - zona.checkedRecently

  function toggle() {
    const next = !abierto
    setAbierto(next)
    if (next && datos === null && !error) {
      void getZonePending(zona.region, zona.country)
        .then(setDatos)
        .catch(() => setError(true))
    }
  }

  return <Box sx={{ mt: 1 }}>
    <Button size="small" startIcon={<FactCheckOutlinedIcon />} onClick={toggle} sx={{ textTransform: 'none', px: 0 }}>
      {t('zones.pendingAction', { n: total.toLocaleString(lang) })}
    </Button>
    <Collapse in={abierto} unmountOnExit>
      <Box sx={{ pt: .5 }}>
        {error && <Alert severity="warning">{t('zones.pendingFailed')}</Alert>}
        {datos === null && !error && <Skeleton lines={3} />}
        {datos?.map((font) => (
          <Box key={font.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: .65, borderTop: 1, borderColor: 'divider' }}>
            <Link component={RouterLink} to={`/fonts/${font.id}`} underline="hover" sx={{ fontWeight: 600 }}>
              {nombreFuente(font, t)}
            </Link>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', flexShrink: 0 }}>
              {font.lastCheck
                ? t('zones.lastChecked', { date: new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(font.lastCheck)) })
                : t('zones.neverChecked')}
            </Typography>
          </Box>
        ))}
        {datos && total > datos.length && (
          <Typography variant="caption" color="text.secondary">{t('zones.pendingShowing', { n: String(datos.length), total: total.toLocaleString(lang) })}</Typography>
        )}
      </Box>
    </Collapse>
  </Box>
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
