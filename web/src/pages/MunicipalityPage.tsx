import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import DownloadIcon from '@mui/icons-material/Download'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import MapOutlinedIcon from '@mui/icons-material/MapOutlined'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import SearchIcon from '@mui/icons-material/Search'
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined'
import { getMunicipality, getMunicipalBoundary, type MunicipalBoundary, type MunicipalReport } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { CoverageBar } from '../components/CoverageBar'
import { FilaDeFuente } from '../components/FilaDeFuente'
import { ListaConTope } from '../components/ListaConTope'
import { TituloDeSeccion } from '../components/TituloDeSeccion'
import { waterStatusInfo } from '../lib/waterStatus'
import { SOURCE_EMOJI } from '../lib/waterType'
import { rotulo } from '../lib/fontName'
import { isRecentlyAvailable, isRecentlyUnavailable, matchesMunicipalFilter, needsReview, sortByMunicipalPriority, type MunicipalFilter } from '../lib/municipality'
import type { WaterSource } from '../api/types'

const MunicipalityMap = lazy(() => import('../components/MunicipalityMap').then((m) => ({ default: m.MunicipalityMap })))

export function MunicipalityPage() {
  const { ine = '' } = useParams()
  const { t, lang } = useI18n()
  const desktop = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [data, setData] = useState<MunicipalReport | null>(null)
  const [boundary, setBoundary] = useState<MunicipalBoundary | null>(null)
  const [error, setError] = useState(false)
  const [mapChoice, setMapChoice] = useState<boolean | null>(null)
  const [filter, setFilter] = useState<MunicipalFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    setData(null); setBoundary(null); setError(false); setMapChoice(null); setFilter('all'); setQuery('')
    getMunicipality(ine).then(setData).catch(() => setError(true))
    getMunicipalBoundary(ine).then(setBoundary).catch(() => setBoundary(null))
  }, [ine])

  const filtered = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLocaleLowerCase(lang)
    return sortByMunicipalPriority(data.items).filter((f) =>
      matchesMunicipalFilter(f, filter) &&
      (!needle || rotulo(f.name, t).toLocaleLowerCase(lang).includes(needle)))
  }, [data, filter, lang, query, t])

  if (error) return <Box className="pad"><Alert severity="info">{t('muni.notFound')}</Alert></Box>
  if (!data) return <Box className="pad"><Skeleton lines={6} /></Box>

  const noPhoto = data.fonts - data.withPhoto
  const available = data.items.filter(isRecentlyAvailable).length
  const unavailable = data.items.filter(isRecentlyUnavailable).length
  const review = data.items.filter(needsReview).length
  const priorities = sortByMunicipalPriority(data.items.filter((f) =>
    f.openReports > 0 || isRecentlyUnavailable(f) || needsReview(f))).slice(0, 6)
  const filters: { key: MunicipalFilter; n: number; label: string }[] = [
    { key: 'all', n: data.fonts, label: t('muni.filterAll') },
    { key: 'open', n: data.items.filter((f) => f.openReports > 0).length, label: t('muni.openReports') },
    { key: 'unavailable', n: unavailable, label: t('muni.unavailableRecent') },
    { key: 'review', n: review, label: t('muni.needsReview') },
    { key: 'never', n: data.neverChecked, label: t('muni.neverChecked') },
    { key: 'stale', n: data.staleOverYear, label: t('muni.staleShort') },
    { key: 'noPhoto', n: noPhoto, label: t('muni.noPhoto') },
    { key: 'available', n: available, label: t('muni.availableRecent') },
  ]

  return <Box className="pad municipality-report" sx={{ maxWidth: 1280, mx: 'auto', '@media print': { maxWidth: 'none', p: 0 } }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'start', mb: 2 }}>
      <Box><Typography variant="h4" sx={{ fontWeight: 800 }}>{t('muni.title', { name: data.municipality })}</Typography><Typography variant="body2" color="text.secondary">{t('muni.lead')}</Typography></Box>
      <Button className="municipality-no-print" variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()} sx={{ display: { xs: 'none', sm: 'inline-flex' }, flexShrink: 0 }}>{t('muni.print')}</Button>
    </Box>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: 1.5, mb: 2 }}>
      <Kpi icon={<WaterDropOutlinedIcon />} value={data.fonts} label={t('muni.inventory')} />
      <Kpi icon={<CheckCircleOutlineIcon />} value={available} label={t('muni.availableRecent')} color="success.main" onClick={() => setFilter('available')} />
      <Kpi icon={<SearchIcon />} value={review} label={t('muni.needsReview')} color="warning.main" onClick={() => setFilter('review')} />
      <Kpi icon={<ReportProblemOutlinedIcon />} value={data.openReports} label={t('muni.openReports')} color="error.main" onClick={() => setFilter('open')} />
    </Box>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(300px,.72fr) minmax(500px,1.28fr)' }, gap: 2, alignItems: 'start' }}>
      <Box>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
          <TituloDeSeccion icono={<ReportProblemOutlinedIcon fontSize="small" />}>{t('muni.priorities')}</TituloDeSeccion>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('muni.prioritiesHint')}</Typography>
          {priorities.length === 0 ? <Alert severity="success">{t('muni.noPriorities')}</Alert> : priorities.map((f) =>
            <FilaDeFuente key={f.id} to={`/fonts/${f.id}`} source={f.source as WaterSource | null} primary={rotulo(f.name, t)} secondary={reason(f, t)} />)}
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <CoverageBar icon={<WaterDropOutlinedIcon fontSize="small" />} label={t('muni.checked')} hint={t('muni.checkedHint')} done={data.checkedEver} total={data.fonts} pct={data.fonts ? Math.round(1000 * data.checkedEver / data.fonts) / 10 : 0} lang={lang} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .75, mt: 1.5 }}>
            {Object.entries(data.bySource).sort((a, b) => b[1] - a[1]).map(([key, n]) =>
              <Chip key={key} size="small" label={key === 'unknown' ? `${n} ${t('muni.unknownType')}` : `${SOURCE_EMOJI[key as WaterSource] ?? ''} ${n} ${t(`source.${key}`)}`} />)}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>{t('muni.drinkableNote')}</Typography>
        </Paper>
      </Box>
      <Box>
        <TituloDeSeccion icono={<MapOutlinedIcon fontSize="small" />}>{t('muni.map')}</TituloDeSeccion>
        {(mapChoice ?? desktop) ? <Suspense fallback={<Skeleton lines={4} />}>{filtered.length ? <MunicipalityMap datos={{ ...data, items: filtered }} contorno={boundary} /> : <Alert severity="info">{t('muni.noResults')}</Alert>}</Suspense> :
          <Button className="municipality-no-print" variant="outlined" startIcon={<MapOutlinedIcon />} onClick={() => setMapChoice(true)}>{t('muni.showMap')}</Button>}
      </Box>
    </Box>

    <Box sx={{ mt: 3 }}>
      <TituloDeSeccion icono={<WaterDropOutlinedIcon fontSize="small" />}>{t('muni.list')}</TituloDeSeccion>
      <Box className="municipality-no-print" sx={{ display: 'flex', flexWrap: 'wrap', gap: .75, mb: 1.5 }}>
        {filters.filter((x) => x.key === 'all' || x.n > 0).map((x) => <Chip key={x.key} clickable color={filter === x.key ? 'primary' : 'default'} variant={filter === x.key ? 'filled' : 'outlined'} label={`${x.label} · ${x.n}`} onClick={() => setFilter(x.key)} />)}
      </Box>
      <TextField className="municipality-no-print" size="small" value={query} onChange={(e) => setQuery(e.target.value)} label={t('muni.search')} sx={{ mb: 1.5, width: '100%', maxWidth: 460 }} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('muni.showing', { n: String(filtered.length), total: String(data.fonts) })}</Typography>
      {filtered.length === 0 ? <Alert severity="info">{t('muni.noResults')}</Alert> : <ListaConTope items={filtered} clave={(f) => f.id} fila={(f) => {
        const status = waterStatusInfo(f.lastStatus)
        return <FilaDeFuente to={`/fonts/${f.id}`} source={f.source as WaterSource | null} primary={rotulo(f.name, t)} secondary={f.days == null ? t('muni.neverCheckedRow') : <>{status && <span title={t(`status.${status.key}`)}>{status.emoji} </span>}{t('muni.checkedAgo', { d: String(f.days) })}{f.openReports ? ` · ${f.openReports} ${t('muni.openReports')}` : ''}</>} />
      }} />}
    </Box>

    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mt: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, alignItems: 'center' }}>
      <Box><Typography sx={{ fontWeight: 800 }}>{t('muni.ctaTitle')}</Typography><Typography variant="body2" color="text.secondary">{t('muni.ctaBody')}</Typography></Box>
      <Button className="municipality-no-print" component="a" href={`mailto:admin@fontapp.net?subject=${encodeURIComponent(`FontApp · ${data.municipality} (${data.ine})`)}`} variant="contained" startIcon={<BusinessOutlinedIcon />} disableElevation>{t('muni.ctaButton')}</Button>
    </Paper>

    <Box sx={{ mt: 3 }}><TituloDeSeccion icono={<DownloadIcon fontSize="small" />}>{t('muni.download')}</TituloDeSeccion><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('muni.downloadNote')}</Typography>
      <Box className="municipality-no-print" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}><Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => download(csvOf(data), `${data.ine}-fuentes.csv`, 'text/csv')}>CSV</Button><Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => download(geojsonOf(data), `${data.ine}-fuentes.geojson`, 'application/geo+json')}>GeoJSON</Button><Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>{t('muni.print')}</Button></Box>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>{t('muni.licence')}</Typography>
    <style>{`@media print { header, footer, .municipality-no-print { display:none!important } .municipality-report { color-adjust:exact; print-color-adjust:exact } }`}</style>
  </Box>
}

function Kpi({ icon, value, label, color = 'primary.main', onClick }: { icon: ReactNode; value: number; label: string; color?: string; onClick?: () => void }) {
  return <Paper component={onClick ? 'button' : 'div'} onClick={onClick} variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: 'left', borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary', font: 'inherit', cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { borderColor: color } : undefined }}><Box sx={{ color, mb: .5 }}>{icon}</Box><Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1 }}>{value}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{label}</Typography></Paper>
}
function reason(f: MunicipalReport['items'][number], t: ReturnType<typeof useI18n>['t']): string {
  if (f.openReports) return `${f.openReports} ${t('muni.openReports')}`
  if (isRecentlyUnavailable(f)) return t('muni.unavailableRecent')
  if (f.days == null) return t('muni.neverCheckedRow')
  return t('muni.checkedAgo', { d: String(f.days) })
}
function escapeCSV(s: string): string { return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
function csvOf(r: MunicipalReport): string { const h = 'id,nombre,latitud,longitud,tipo,potabilidad_declarada,tiene_foto,resenas,ultimo_estado,dias_desde_la_ultima,incidencias_abiertas\n'; return h + r.items.map((f) => [f.id, f.name ?? '', f.latitude.toFixed(6), f.longitude.toFixed(6), f.source ?? '', f.drinkable ?? '', f.hasPhoto ? 'sí' : 'no', String(f.reviews), f.lastStatus ?? '', f.days == null ? '' : String(f.days), String(f.openReports)].map(escapeCSV).join(',')).join('\n') + '\n' }
function geojsonOf(r: MunicipalReport): string { return JSON.stringify({ type: 'FeatureCollection', name: `Fuentes de ${r.municipality} (INE ${r.ine})`, attribution: 'FontApp y sus colaboradores · OpenStreetMap (ODbL) · ICGC/ACA (CC BY 4.0)', features: r.items.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.longitude, f.latitude] }, properties: { id: f.id, nombre: f.name, tipo: f.source, potabilidad_declarada: f.drinkable, tiene_foto: f.hasPhoto, resenas: f.reviews, ultimo_estado: f.lastStatus, incidencias_abiertas: f.openReports } })) }, null, 2) }
function download(text: string, name: string, type: string): void { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }
