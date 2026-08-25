import { useEffect, useMemo, useRef, useState } from 'react'
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
import { apiFetch, createComment, describeError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/ToastContext'
import { enqueue, isOffline } from '../lib/outbox'
import { WATER_STATUS, WATER_STATUS_OPTIONS } from '../lib/waterStatus'
import { diasDesde, olvidaRuta, recuerdaRuta, rutaRecordada } from '../lib/routeMemory'
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
  const { user } = useAuth()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const scope = user?.id ?? 'anonymous'
  const [recordada, setRecordada] = useState(() => rutaRecordada(user?.id ?? 'anonymous'))
  // Las que ya has contado en esta visita. Se guardan aquí y no en `localStorage`: es
  // información de un rato, y la de verdad ya está publicada en la fuente.
  const [contadas, setContadas] = useState<Record<string, string>>({})
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
      const nombre = file.name.replace(/\.gpx$/i, '')
      setNombreRuta(nombre)
      setContadas({})
      // Se recuerda al importar, no al salir: quien sube el GPX lo hace antes de la ruta,
      // y es al volver cuando hace falta tenerla puesta sin buscar el fichero otra vez.
      recuerdaRuta({ nombre, cuando: new Date().toISOString(), puntos }, scope)
      setRecordada(rutaRecordada(scope))
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

  // Al abrir, si hay una ruta recordada se pone sola y se piden sus fuentes. Sin esto,
  // volver a contar cómo estaban obligaría a rebuscar el fichero en el móvil, que es
  // exactamente lo que nadie hace.
  useEffect(() => {
    if (!recordada || ruta.length > 1 || cargando) return
    setRuta(recordada.puntos)
    setNombreRuta(recordada.nombre)
    const caja = cajaDe(recordada.puntos)
    const params = new URLSearchParams({
      minLat: String(caja.minLat), maxLat: String(caja.maxLat),
      minLong: String(caja.minLong), maxLong: String(caja.maxLong),
    })
    setCargando(true)
    apiFetch<FontSummary[]>(`/fonts/in-bounds?${params}`)
      .then(setFuentes)
      .catch(() => setError(t('gpxIn.failed')))
      .finally(() => setCargando(false))
    // Solo al montar: si dependiera de `ruta`, se volvería a pedir en cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cuenta(fontID: string, estado: string) {
    setContadas((c) => ({ ...c, [fontID]: estado }))
    try {
      await createComment(fontID, { waterStatus: estado })
      toast.show(t('toast.reviewPosted'))
    } catch (e) {
      if (isOffline(e)) {
        // En el monte y sin cobertura es justo donde se sabe cómo estaba la fuente. La
        // bandeja de salida ya existe para esto y la vacía sola al volver la red.
        await enqueue({ kind: 'comment', fontID, data: { waterStatus: estado } })
        toast.show(t('offline.savedUpdate'))
      } else {
        setContadas((c) => { const n = { ...c }; delete n[fontID]; return n })
        toast.show(describeError(e, t))
      }
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

      {/* La invitación a cerrar el círculo. Va **condicional** —«si la has hecho»— y no
          «has pasado cerca de 8 fuentes»: la app no sabe si de verdad saliste, solo que
          importaste el recorrido. Afirmarlo sería inventarse un hecho sobre el usuario, y
          la primera vez que se equivoque deja de creerse lo demás. */}
      {recordada && ruta.length > 1 && (
        <Alert
          severity="info" icon={false} sx={{ mt: 2 }}
          action={
            <Button size="small" color="inherit" onClick={() => { olvidaRuta(scope); setRecordada(null) }}>
              {t('gpxIn.forget')}
            </Button>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {/* «hace 0 días» no lo dice nadie. El mismo día tiene su propia frase. */}
            {diasDesde(recordada.cuando) === 0
              ? t('gpxIn.backToday', { name: recordada.nombre })
              : t('gpxIn.backTitle', { name: recordada.nombre, d: String(diasDesde(recordada.cuando)) })}
          </Typography>
          <Typography variant="body2">{t('gpxIn.backBody')}</Typography>
        </Alert>
      )}

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
              {enRuta.map((x) => (
                <Fila
                  key={x.fuente.id ?? `${x.kmRuta}`}
                  x={x}
                  contado={x.fuente.id ? contadas[x.fuente.id] : undefined}
                  onCuenta={user && x.fuente.id ? (estado) => void cuenta(x.fuente.id!, estado) : undefined}
                />
              ))}
            </List>
          )}
        </>
      )}
    </Box>
  )
}

function Fila({ x, contado, onCuenta }: {
  x: EnRuta<FontSummary>
  contado?: string
  /** `undefined` sin sesión: sin ella no hay a quién atribuir la reseña. */
  onCuenta?: (estado: string) => void
}) {
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

      {/* Contar el estado desde aquí es lo que convierte esta pantalla en datos. Va con la
          misma regla que el atajo de la ficha: reseña **solo con el estado**, sin texto ni
          valoración, y **sin `unknown` ni `gone`**. El primero no dice nada viniendo de
          quien ha pasado por allí, y «ya no está» es el estado más caro —dos testimonios
          retiran la fuente del mapa— así que no se pone a un toque en una lista de veinte.
          Quien de verdad lo quiera decir tiene el formulario entero en la ficha. */}
      {onCuenta && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', ml: '62px', mt: 0.75 }}>
          {contado ? (
            <Chip size="small" color="success" variant="outlined"
                  label={`${WATER_STATUS[contado]?.emoji ?? ''} ${t('gpxIn.counted')}`} />
          ) : (
            WATER_STATUS_OPTIONS.filter((k) => k !== 'unknown' && k !== 'gone').map((k) => (
              <Chip key={k} clickable size="small" variant="outlined"
                    label={`${WATER_STATUS[k].emoji} ${t(`status.${k}`)}`}
                    onClick={() => onCuenta(k)} />
            ))
          )}
        </Box>
      )}
    </ListItem>
  )
}
