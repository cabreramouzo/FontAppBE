import { useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import type { FontSummary } from '../api/types'
import { apiFetch } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { nombreFuente } from '../lib/fontName'
import { confidenceOf, CONFIDENCE_EMOJI, confidenceLabelKey, type ConfidenceLevel } from '../lib/confidence'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'
import { construyeGPX, nombreFichero, type PuntoGPX } from '../lib/gpx'
import {
  cajaDe, fuentesEnRuta, largoKm, leeGPX, simplifica, CORREDOR_M, type EnRuta,
} from '../lib/gpxImport'

const CORREDORES = [100, 250, 500, 1000]

/**
 * «Agua en mi ruta»: sueltas un GPX y te dice qué fuentes hay por el camino.
 *
 * Lo pidió un ciclista de montaña que planifica en Strava o Wikiloc. La pregunta que trae
 * no es «dónde hay fuentes» —eso ya lo contesta el mapa— sino **«en cuál lleno el bidón»**,
 * y eso solo se contesta con su recorrido delante.
 *
 * ## El fichero no sale de aquí
 *
 * Se lee en el navegador. Un GPX es por dónde se mueve una persona y casi siempre empieza
 * en su casa; no hay ninguna razón para que eso viaje a un servidor. Al servidor solo se le
 * pide la **caja que envuelve el recorrido**, que es lo mismo que ya se le pide al mover el
 * mapa por esa zona, y es una ruta pública que no guarda nada.
 *
 * ## Se ordena por kilómetro, no por cercanía
 *
 * Quien mira esto decide dónde parar, y eso se decide en el orden en que se pedalea.
 *
 * ## Y se dice lo que NO sabemos
 *
 * El resumen de arriba separa lo confirmado de lo que no ha comprobado nadie nunca. En una
 * base donde la mayoría de las fuentes no las ha visto nadie, un «12 fuentes» a secas es
 * una promesa que el día que estés sediento no se sostiene.
 */
export function RouteWaterPage() {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [ruta, setRuta] = useState<ReturnType<typeof leeGPX>>([])
  const [fuentes, setFuentes] = useState<FontSummary[] | null>(null)
  const [corredor, setCorredor] = useState(CORREDOR_M)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [nombreRuta, setNombreRuta] = useState('')

  async function abrir(file: File) {
    setError(''); setCargando(true); setFuentes(null); setRuta([])
    try {
      const texto = await file.text()
      const puntos = simplifica(leeGPX(texto))
      if (puntos.length < 2) {
        setError(t('gpxIn.notATrack'))
        return
      }
      setRuta(puntos)
      setNombreRuta(file.name.replace(/\.gpx$/i, ''))
      const caja = cajaDe(puntos)
      const params = new URLSearchParams({
        minLat: String(caja.minLat), maxLat: String(caja.maxLat),
        minLong: String(caja.minLong), maxLong: String(caja.maxLong),
      })
      setFuentes(await apiFetch<FontSummary[]>(`/fonts/in-bounds?${params}`))
    } catch {
      setError(t('gpxIn.failed'))
    } finally {
      setCargando(false)
    }
  }

  const enRuta = useMemo(
    () => (fuentes && ruta.length > 1 ? fuentesEnRuta(fuentes, ruta, corredor) : []),
    [fuentes, ruta, corredor],
  )

  // El reparto por fiabilidad. Es la mitad interesante del resumen: en esta base la
  // mayoría de las fuentes no las ha comprobado nadie, y callarlo sería prometer agua.
  const reparto = useMemo(() => {
    const r = new Map<ConfidenceLevel, number>()
    for (const x of enRuta) {
      const nivel = confidenceOf(x.fuente)
      r.set(nivel, (r.get(nivel) ?? 0) + 1)
    }
    return [...r.entries()].sort((a, b) => b[1] - a[1])
  }, [enRuta])

  function descargar() {
    const puntos: PuntoGPX[] = enRuta.map((x) => ({
      lat: x.fuente.latitude,
      lon: x.fuente.longitude,
      nombre: nombreFuente(x.fuente, t),
      descripcion: t('gpxIn.wptDesc', { km: x.kmRuta.toFixed(1), m: String(x.desvioM) }),
    }))
    const url = URL.createObjectURL(new Blob([construyeGPX(puntos)], { type: 'application/gpx+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombreFichero()
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{t('gpxIn.title')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>{t('gpxIn.intro')}</Typography>

      <input
        ref={input}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void abrir(f); e.target.value = '' }}
      />
      <Button variant="contained" disableElevation startIcon={<UploadIcon />}
              onClick={() => input.current?.click()} sx={{ textTransform: 'none', minHeight: 48 }}>
        {t('gpxIn.pick')}
      </Button>
      {/* Se dice antes de que suelte el fichero, no después: es la pregunta que se hace
          cualquiera al ver un botón de subir un recorrido. */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t('gpxIn.privacy')}
      </Typography>

      {cargando && <Box sx={{ my: 3, textAlign: 'center' }}><CircularProgress /></Box>}
      {error && <Alert severity="warning" sx={{ my: 2 }}>{error}</Alert>}

      {ruta.length > 1 && fuentes && (
        <>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mt: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>{nombreRuta}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('gpxIn.summary', { km: largoKm(ruta).toFixed(1), n: String(enRuta.length) })}
            </Typography>

            {reparto.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                {reparto.map(([nivel, n]) => (
                  <Chip key={nivel} size="small" variant="outlined"
                        label={`${CONFIDENCE_EMOJI[nivel]} ${n} · ${t(confidenceLabelKey(nivel))}`} />
                ))}
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, flexWrap: 'wrap' }}>
              <TextField
                select size="small" label={t('gpxIn.corridor')} value={corredor}
                onChange={(e) => setCorredor(Number(e.target.value))} sx={{ minWidth: 140 }}
              >
                {CORREDORES.map((m) => (
                  <MenuItem key={m} value={m}>{m < 1000 ? `${m} m` : `${m / 1000} km`}</MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" startIcon={<DownloadIcon />} disabled={enRuta.length === 0}
                      onClick={descargar} sx={{ textTransform: 'none' }}>
                {t('gpxIn.export')}
              </Button>
            </Box>
          </Paper>

          {enRuta.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>{t('gpxIn.none')}</Alert>
          ) : (
            <List sx={{ mt: 1 }}>
              {enRuta.map((x) => <Fila key={x.fuente.id ?? `${x.kmRuta}`} x={x} />)}
            </List>
          )}
        </>
      )}
    </Box>
  )
}

function Fila({ x }: { x: EnRuta<FontSummary> }) {
  const { t } = useI18n()
  const ws = waterStatusInfo(x.fuente.lastWaterStatus ?? null)
  const nivel = confidenceOf(x.fuente)
  return (
    <ListItem divider alignItems="flex-start" sx={{ display: 'block', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        {/* El kilómetro primero y en negrita: es por lo que se lee esta lista. */}
        <Typography sx={{ fontWeight: 800, minWidth: 62 }}>{t('gpxIn.km', { km: x.kmRuta.toFixed(1) })}</Typography>
        <Link component={RouterLink} to={`/fonts/${x.fuente.id}`} sx={{ fontWeight: 600 }}>
          {nombreFuente(x.fuente, t)}
        </Link>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ ml: '62px' }}>
        {[
          t('gpxIn.detour', { m: String(x.desvioM) }),
          x.eleRutaM !== null ? t('gpxIn.routeEle', { m: String(Math.round(x.eleRutaM)) }) : null,
          ws && x.fuente.lastUpdate ? `${t(`status.${ws.key}`)} · ${timeAgo(x.fuente.lastUpdate, t)}`
            : `${CONFIDENCE_EMOJI[nivel]} ${t(confidenceLabelKey(nivel))}`,
        ].filter(Boolean).join(' · ')}
      </Typography>
    </ListItem>
  )
}
