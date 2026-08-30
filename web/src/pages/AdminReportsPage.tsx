import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Switch from '@mui/material/Switch'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { getAdminReports, setReportIncident, describeError, type AdminReport } from '../api/client'
import { INCIDENT_KINDS, type IncidentKind } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { TituloDeSeccion } from '../components/TituloDeSeccion'
import ReportProblemIcon from '@mui/icons-material/ReportProblemOutlined'
import { rotulo } from '../lib/fontName'
import { timeAgo } from '../lib/time'

/**
 * Todo lo escrito en la caja de la ficha, para repasarlo de una sentada.
 *
 * ## Por qué hace falta una pantalla para esto
 *
 * La marca de incidencia llegó **después** que los datos: todo lo que hay escrito entró
 * cuando la caja se llamaba «incidencia», así que hay comentarios de organización —«¿le
 * puedes poner una foto?»— contados como averías abiertas, y ninguno se va a cerrar solo
 * porque no hay nada que arreglar. Ficha por ficha eso no se puede limpiar: no existía
 * ninguna pantalla que contestara «enséñame todo lo que hay escrito».
 *
 * Por eso el interruptor de cada fila **no navega a ninguna parte**: se marca y se
 * desmarca desde aquí, en la lista, que es lo que hace que repasar cincuenta sea cuestión
 * de un minuto y no de cincuenta pestañas.
 *
 * Escribe por la **misma ruta** que la ficha (`PATCH …/incident`), no por una de
 * administración aparte: dos puertas con reglas distintas para lo mismo es como se acaba
 * teniendo dos comportamientos distintos. Mismo criterio que el panel de moderación.
 */
export function AdminReportsPage() {
  const { t } = useI18n()
  const [filas, setFilas] = useState<AdminReport[] | null>(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<'all' | 'incidents' | 'comments'>('all')

  useEffect(() => {
    getAdminReports().then(setFilas).catch((e) => setError(describeError(e, t)))
    // `t` cambia con el idioma y volver a pedir la lista por eso sería absurdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function marca(r: AdminReport, esIncidencia: boolean, tipo?: IncidentKind) {
    // Optimista: son cincuenta filas y esperar a la red en cada toque convierte el repaso
    // en un trabajo. Si falla se repone la fila y se dice.
    const antes = filas
    setFilas((fs) => (fs ?? []).map((f) => f.id === r.id
      ? { ...f, isIncident: esIncidencia, incidentKind: esIncidencia ? (tipo ?? f.incidentKind ?? 'other') : null }
      : f))
    try {
      await setReportIncident(r.fontID, r.id, esIncidencia, esIncidencia ? (tipo ?? r.incidentKind ?? 'other') : undefined)
    } catch (e) {
      setFilas(antes)
      setError(describeError(e, t))
    }
  }

  if (error && !filas) return <Box className="pad"><Alert severity="error">{error}</Alert></Box>
  if (!filas) return <Box className="pad"><Skeleton lines={6} /></Box>

  const visibles = filas.filter((f) =>
    filtro === 'all' || (filtro === 'incidents' ? f.isIncident : !f.isIncident))
  const incidencias = filas.filter((f) => f.isIncident).length

  return (
    <Box className="pad" sx={{ maxWidth: 1040, mx: 'auto' }}>
      <TituloDeSeccion icono={<ReportProblemIcon fontSize="small" />}>{t('adminReports.title')}</TituloDeSeccion>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('adminReports.lead', { n: String(incidencias), m: String(filas.length) })}
      </Typography>

      <ToggleButtonGroup
        size="small" exclusive value={filtro}
        onChange={(_, v) => { if (v) setFiltro(v) }}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="all">{t('adminReports.all')}</ToggleButton>
        <ToggleButton value="incidents">{t('adminReports.onlyIncidents')}</ToggleButton>
        <ToggleButton value="comments">{t('adminReports.onlyComments')}</ToggleButton>
      </ToggleButtonGroup>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {visibles.map((r) => (
        <Box
          key={r.id}
          sx={{
            py: 1.25, borderBottom: '1px solid', borderColor: 'divider',
            // Lo que está marcado como incidencia se ve de un vistazo: en un repaso lo
            // que se busca es lo que NO debería estarlo.
            bgcolor: r.isIncident ? 'action.hover' : 'transparent',
            px: 1, borderRadius: 1,
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 1 }}>
            <Link component={RouterLink} to={`/fonts/${r.fontID}`} sx={{ fontWeight: 600 }}>
              {rotulo(r.fontName, t)}
            </Link>
            <Typography variant="caption" color="text.secondary">
              {r.username ? `@${r.username}` : t('adminReports.noAuthor')}
              {r.createdAt ? ` · ${timeAgo(r.createdAt, t)}` : ''}
              {r.resolvedAt ? ` · ${t('adminReports.resolved')}` : ''}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>{r.message}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <FormControlLabel
              control={<Switch size="medium" checked={r.isIncident} onChange={(e) => void marca(r, e.target.checked)} />}
              label={<Typography variant="body2">{t('comment.isIncident')}</Typography>}
            />
            {r.isIncident && INCIDENT_KINDS.map((k) => (
              <Chip
                key={k}
                label={t(`incident.${k}`)}
                size="small"
                color={r.incidentKind === k ? 'warning' : 'default'}
                variant={r.incidentKind === k ? 'filled' : 'outlined'}
                onClick={() => void marca(r, true, k)}
              />
            ))}
          </Box>
        </Box>
      ))}

      {visibles.length === 0 && (
        <Typography color="text.secondary">{t('adminReports.empty')}</Typography>
      )}
    </Box>
  )
}
