import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
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
import MapIcon from '@mui/icons-material/MapOutlined'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import type { FontSummary } from '../api/types'
import { apiFetch, apiUrl, createComment, describeError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/ToastContext'
import { fijaParaOffline } from '../lib/fijarOffline'
import { enqueue, isOffline } from '../lib/outbox'
import { WATER_STATUS, WATER_STATUS_OPTIONS } from '../lib/waterStatus'
import { diasDesde, olvidaRuta, recuerdaRuta, rutaRecordada } from '../lib/routeMemory'
import { useI18n } from '../i18n/I18nContext'
import { nombreFuente } from '../lib/fontName'
import { confidenceOf, constaAgua, CONFIDENCE_EMOJI, confidenceLabelKey, type ConfidenceLevel } from '../lib/confidence'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'
import { construyeGPX, MAX_WAYPOINTS, nombreFichero, type PuntoGPX } from '../lib/gpx'
import { alterna, claveDe, soloDesde } from '../lib/routeSelection'
import {
  cajaDe, fuentesEnRuta, largoKm, leeGPX, perfil, simplifica, subidaEntre, tramoMasSeco,
  tramosSecos, CORREDOR_M, type EnRuta,
} from '../lib/gpxImport'
import { RouteProfile } from '../components/RouteProfile'

/**
 * El mapa se carga **solo si lo piden**.
 *
 * Leaflet y sus capas rondan los 300 KB, treinta veces lo que ocupa esta página. Casi
 * siempre se abre en casa preparando la ruta, así que ese peso no es un veto —pero tampoco
 * hay razón para que lo pague quien solo quiere la lista y el perfil, que es lo que
 * contesta las preguntas importantes. Quien lo pide, lo carga.
 */
const RouteMap = lazy(() => import('../components/RouteMap').then((m) => ({ default: m.RouteMap })))

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
  // Qué hacer para volver a intentarlo, cuando lo que falló fue la red y no el fichero.
  // `null` = no hay nada que reintentar (el GPX está mal y hay que elegir otro).
  const [reintenta, setReintenta] = useState<(() => void) | null>(null)
  const [nombreRuta, setNombreRuta] = useState('')
  const [mapaAbierto, setMapaAbierto] = useState(false)
  // Las que NO se llevan al GPS. Vacío = todas, que es lo que hacía esta pantalla antes de
  // que se pudiera elegir, así que quien no toque nada no nota ningún cambio. Ver
  // `lib/routeSelection.ts` para por qué se guardan las excluidas y no las elegidas.
  const [excluidas, setExcluidas] = useState<ReadonlySet<string>>(new Set())
  // El mismo corte que usa toda la app: la forma cambia de verdad, no solo el tamaño.
  const movil = useMediaQuery((tema: Theme) => tema.breakpoints.down('sm'))

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
      // La selección es de este recorrido: con otro fichero delante, las claves del
      // anterior no se refieren a nada y dejarían fuentes fuera sin que se viera por qué.
      // No se toca al cambiar el corredor, que es cuando sí interesa conservarla.
      setExcluidas(new Set())
      // Se recuerda al importar, no al salir: quien sube el GPX lo hace antes de la ruta,
      // y es al volver cuando hace falta tenerla puesta sin buscar el fichero otra vez.
      recuerdaRuta({ nombre, cuando: new Date().toISOString(), puntos }, scope)
      setRecordada(rutaRecordada(scope))
      await pideFuentes(puntos)
    } catch {
      // Aquí solo llega lo del FICHERO. Lo del servidor lo trata `pideFuentes`, y
      // mezclarlos era un fallo con consecuencias: durante una caída del backend esta
      // pantalla decía «no se ha podido leer el fichero», o sea acusaba al GPX del
      // usuario. Se reportó literalmente como «falla la carga del archivo gpx» y mandó
      // el diagnóstico al sitio equivocado durante una hora. Un mensaje de error que
      // señala mal cuesta más que no dar ninguno.
      setError(t('gpxIn.failed'))
      setReintenta(null)
    } finally {
      setCargando(false)
    }
  }

  /// Pide las fuentes de la caja del recorrido. Separado porque lo usan las dos entradas
  /// —soltar un fichero y recuperar la ruta recordada— y porque su error es de red, no
  /// del GPX: se puede reintentar sin volver a elegir el fichero.
  async function pideFuentes(puntos: ReturnType<typeof leeGPX>) {
    const caja = cajaDe(puntos)
    const params = new URLSearchParams({
      minLat: String(caja.minLat), maxLat: String(caja.maxLat),
      minLong: String(caja.minLong), maxLong: String(caja.maxLong),
    })
    setCargando(true)
    const ruta = `/fonts/in-bounds?${params}`
    try {
      setFuentes(await apiFetch<FontSummary[]>(ruta))
      setError(''); setReintenta(null)
      // Las fuentes de este recorrido quedan **a salvo del descarte** del caché.
      //
      // Quien sube un GPX lo hace en casa y con red, y las va a necesitar en el monte y
      // sin ella. Sin fijarlas, un rato de curiosear por el mapa antes de salir se las
      // lleva por delante y llega al valle sin nada. Es una sola respuesta y son sus
      // datos, así que se hace solo: no promete nada que no estuviera ya prometido, solo
      // deja de ser una lotería.
      void fijaParaOffline([apiUrl(ruta)])
    } catch (e) {
      // `describeError` da el motivo de verdad —«Sin conexión con el servidor»— en el
      // idioma de quien lee, en vez de una frase inventada por esta pantalla.
      setError(describeError(e, t))
      setReintenta(() => () => void pideFuentes(puntos))
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
    void pideFuentes(recordada.puntos)
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

  // Las claves se calculan **una vez** y de aquí en adelante todo son cadenas. Es el
  // único punto que mira dentro de una parada, y no es manía: la primera versión le pasaba
  // `enRuta` tal cual a la selección, cuyo id no está arriba sino en `.fuente.id`, así que
  // marcabas casillas y el contador no se movía. Compilaba.
  const claves = useMemo(
    () => enRuta.map((x) => claveDe({ id: x.fuente.id, kmRuta: x.kmRuta })),
    [enRuta],
  )

  // Elegir afecta **solo a la exportación**: la lista, el perfil, el mapa y el tramo seco
  // siguen enseñando el recorrido entero. El tramo seco es un hecho de la ruta y no de lo
  // que hayas marcado, y por una fuente que descartes para el GPS sigues pasando, así que
  // tienes que poder contar cómo estaba al volver.
  const paraGPS = useMemo(
    () => enRuta.filter((_, i) => !excluidas.has(claves[i])),
    [enRuta, claves, excluidas],
  )

  const alturas = useMemo(() => perfil(ruta), [ruta])
  const total = useMemo(() => largoKm(ruta), [ruta])

  const seco = useMemo(() => tramoMasSeco(enRuta.map((x) => x.kmRuta), total), [enRuta, total])

  /**
   * El mismo tramo, contando solo las fuentes de las que **consta agua**.
   *
   * La cifra de arriba cuenta todas las del corredor, incluidas las que no ha comprobado
   * nadie nunca —que en esta base son casi todas— y las que constan **secas**. Así que es
   * la versión optimista, y el día que estás sediento no se sostiene. Ésta es la que
   * decide si llevas un bidón o dos.
   *
   * Solo se enseña si de verdad cambia algo: si coinciden, repetir la misma cifra dos
   * veces con dos rótulos distintos es ruido.
   */
  const secoFiable = useMemo(
    () => tramoMasSeco(enRuta.filter((x) => constaAgua(x.fuente)).map((x) => x.kmRuta), total),
    [enRuta, total],
  )

  /**
   * El hueco sin agua que más sube.
   *
   * Cinco kilómetros en llano y cinco cuesta arriba no son lo mismo, y el perfil ya lo
   * enseña — pero solo a quien sabe leerlo. Se busca por desnivel y no por longitud, así
   * que casi nunca es el mismo tramo que el de arriba: ése es el más largo, éste el que
   * más se nota.
   *
   * Sin altitudes en el GPX no hay nada que decir y no se pinta.
   */
  const subida = useMemo(() => {
    if (alturas.length < 2) return null
    const kms = enRuta.map((x) => x.kmRuta)
    let mejor: { desdeKm: number; hastaKm: number; subidaM: number } | null = null
    for (const t of tramosSecos(kms, total)) {
      const m = subidaEntre(alturas, t.desdeKm, t.hastaKm)
      if (!mejor || m > mejor.subidaM) mejor = { desdeKm: t.desdeKm, hastaKm: t.hastaKm, subidaM: m }
    }
    // Menos de 100 m no es una subida, es un repecho: nombrarlo sería dar por importante
    // algo que no se nota.
    return mejor && mejor.subidaM >= 100 ? mejor : null
  }, [alturas, enRuta, total])

  function descargar() {
    const puntos: PuntoGPX[] = paraGPS.map((x) => ({
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
      {/* El error va con lo que se puede hacer al respecto. Si falló la red, reintentar
          NO obliga a volver a elegir el fichero: el recorrido ya está leído y guardado. */}
      {error && (
        <Alert
          severity="error" sx={{ mt: 2 }}
          action={reintenta
            ? <Button color="inherit" size="small" onClick={reintenta} sx={{ textTransform: 'none' }}>
                {/* Se reutiliza la clave que ya existe en los ocho idiomas, como con
                    `guard.showAll`: una clave nueva que diga «Reintentar» sería la misma
                    palabra traducida dos veces. */}
                {t('zones.retry')}
              </Button>
            : undefined}
        >
          {error}
        </Alert>
      )}

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

      {ruta.length > 1 && fuentes && (
        <>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mt: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>{nombreRuta}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('gpxIn.summary', { km: total.toFixed(1), n: String(enRuta.length) })}
            </Typography>

            {/* El tramo más seco, antes que el reparto de fiabilidad. Es la frase que
                de verdad decide dónde llenas el bidón, y en la lista está enterrada:
                habría que leer diez líneas y restar kilómetros de cabeza. */}
            <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
              {enRuta.length === 0
                ? t('gpxIn.driestAll')
                : t('gpxIn.driest', {
                    km: seco.largoKm.toFixed(1),
                    a: seco.desdeKm.toFixed(1),
                    b: seco.hastaKm.toFixed(1),
                  })}
            </Typography>

            {/* La versión pesimista, solo si de verdad cambia algo: si coinciden, repetir
                la misma cifra con dos rótulos distintos es ruido. */}
            {enRuta.length > 0 && secoFiable.largoKm > seco.largoKm && (
              <Typography variant="body2" color="text.secondary">
                {t('gpxIn.driestSure', {
                  km: secoFiable.largoKm.toFixed(1),
                  a: secoFiable.desdeKm.toFixed(1),
                  b: secoFiable.hastaKm.toFixed(1),
                })}
              </Typography>
            )}

            {/* Cinco kilómetros en llano y cinco cuesta arriba no son lo mismo. */}
            {subida && (
              <Typography variant="body2" color="text.secondary">
                {t('gpxIn.driestClimb', {
                  a: subida.desdeKm.toFixed(1),
                  b: subida.hastaKm.toFixed(1),
                  m: String(Math.round(subida.subidaM)),
                })}
              </Typography>
            )}

            {reparto.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                {reparto.map(([nivel, n]) => (
                  <Chip key={nivel} size="small" variant="outlined"
                        label={`${CONFIDENCE_EMOJI[nivel]} ${n} · ${t(confidenceLabelKey(nivel))}`} />
                ))}
              </Box>
            )}

            {/* El orden es el de la decisión: cuánto me desvío → cuáles me llevo →
                descargar. Con el botón arriba se leía «Descargar 127» antes de saber qué
                hacen las casillas, o sea la cifra antes que su explicación. */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, flexWrap: 'wrap' }}>
              <TextField
                select size="small" label={t('gpxIn.corridor')} value={corredor}
                onChange={(e) => setCorredor(Number(e.target.value))} sx={{ minWidth: 140 }}
              >
                {CORREDORES.map((m) => (
                  <MenuItem key={m} value={m}>{m < 1000 ? `${m} m` : `${m / 1000} km`}</MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Elegir qué se lleva al GPS. Lo pidió quien lo usa: sales de casa con el
                bidón lleno, así que las primeras del recorrido sobran, y en una ruta larga
                treinta waypoints son una pantalla ilegible en un aparato de manillar.
                Solo se pinta cuando hay algo que elegir: con una fuente no hay decisión. */}
            {enRuta.length > 1 && (
              <Box sx={{ mt: 1.5 }}>
                {/* Qué hacen las casillas hay que **decirlo**, igual que con los chips de
                    reseñar: una casilla sin rótulo al lado de un kilómetro no dice si
                    marca «ya he pasado» o «llévatela». Va una vez aquí, no en cada fila. */}
                <Typography variant="body2" color="text.secondary">{t('gpxIn.selectHint')}</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                    {t('gpxIn.selected', { n: String(paraGPS.length), m: String(enRuta.length) })}
                  </Typography>
                  <Button size="small" disabled={excluidas.size === 0}
                          onClick={() => setExcluidas(new Set())} sx={{ textTransform: 'none' }}>
                    {t('gpxIn.selectAll')}
                  </Button>
                  <Button size="small" disabled={paraGPS.length === 0}
                          onClick={() => setExcluidas(new Set(claves))}
                          sx={{ textTransform: 'none' }}>
                    {t('gpxIn.selectNone')}
                  </Button>
                </Box>
              </Box>
            )}

            {/* El tope no es nuestro, es de los aparatos, y `construyeGPX` recorta en
                silencio: sin avisar, te vas al monte creyendo que llevas las 700. Ahora que
                se puede elegir, además hay algo que hacer al respecto. */}
            {paraGPS.length > MAX_WAYPOINTS && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {t('gpxIn.tooMany', { n: String(MAX_WAYPOINTS), total: String(paraGPS.length) })}
              </Alert>
            )}

            <Button variant="outlined" startIcon={<DownloadIcon />} disabled={paraGPS.length === 0}
                    onClick={descargar}
                    sx={{ textTransform: 'none', mt: 1.5, minHeight: movil ? 48 : undefined }}>
              {/* El botón dice CUÁNTAS se lleva. Sin la cifra, marcar casillas es un gesto
                  a ciegas: no hay forma de comprobar que lo elegido es lo que se descarga
                  hasta abrir el fichero en el aparato. */}
              {t('gpxIn.exportN', { n: String(paraGPS.length) })}
            </Button>
          </Paper>

          <RouteProfile
            puntos={alturas}
            fuentes={enRuta.map((x) => ({ kmRuta: x.kmRuta, nombre: nombreFuente(x.fuente, t) }))}
            largoKm={total}
          />

          {/* El mapa contesta dos cosas que ni la lista ni el perfil pueden: si has subido
              el fichero correcto, y de qué lado del camino cae cada fuente. */}
          <Box sx={{ mt: 2 }}>
            {mapaAbierto ? (
              <Suspense fallback={<Box sx={{ height: 320, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}>
                <RouteMap
                  ruta={ruta}
                  fuentes={enRuta.map((x) => ({
                    lat: x.fuente.latitude, lon: x.fuente.longitude,
                    nombre: nombreFuente(x.fuente, t), kmRuta: x.kmRuta,
                  }))}
                />
              </Suspense>
            ) : (
              <Button startIcon={<MapIcon />} onClick={() => setMapaAbierto(true)} sx={{ textTransform: 'none' }}>
                {t('gpxIn.showMap')}
              </Button>
            )}
          </Box>

          {/* Que se puede reseñar desde aquí hay que **decirlo**. Los chips de cada fila
              en escritorio aún se deducen; en un móvil son cuatro etiquetas pequeñas que
              parecen información, no botones. Va una vez encima de la lista y no en cada
              fila: repetirlo veinte veces es ruido.
              Y sin sesión también se dice, en vez de no pintar nada: si los chips
              simplemente no salen, quien no ha entrado ni se entera de que esto existe. */}
          {enRuta.length > 0 && (
            <Alert severity="success" icon={false} sx={{ mt: 2 }}>
              {user ? (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('gpxIn.reportTitle')}</Typography>
                  <Typography variant="body2">{t('gpxIn.reportBody')}</Typography>
                </>
              ) : (
                <Typography variant="body2">
                  <Link component={RouterLink} to="/login">{t('gpxIn.reportLogin')}</Link>
                </Typography>
              )}
            </Alert>
          )}

          {enRuta.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>{t('gpxIn.none')}</Alert>
          ) : (
            <List sx={{ mt: 1 }}>
              {enRuta.map((x, i) => (
                <Fila
                  key={claves[i]}
                  x={x}
                  contado={x.fuente.id ? contadas[x.fuente.id] : undefined}
                  onCuenta={user && x.fuente.id ? (estado) => void cuenta(x.fuente.id!, estado) : undefined}
                  movil={movil}
                  // Con una sola fuente no hay nada que elegir, así que no se pinta la
                  // casilla: sería un control que solo puede dejarte sin fichero.
                  elegible={enRuta.length > 1}
                  llevar={!excluidas.has(claves[i])}
                  onLlevar={() => setExcluidas((e) => alterna(e, claves[i]))}
                  // En la primera no hay nada que descartar antes: sería un botón que no
                  // hace nada, y eso enseña a no fiarse del resto.
                  onDesdeAqui={i === 0 ? undefined : () => setExcluidas(soloDesde(claves, claves[i]))}
                />
              ))}
            </List>
          )}
        </>
      )}
    </Box>
  )
}

function Fila({ x, contado, onCuenta, movil, elegible, llevar, onLlevar, onDesdeAqui }: {
  x: EnRuta<FontSummary>
  contado?: string
  /** `undefined` sin sesión: sin ella no hay a quién atribuir la reseña. */
  onCuenta?: (estado: string) => void
  movil: boolean
  elegible: boolean
  llevar: boolean
  onLlevar: () => void
  /** `undefined` en la primera parada, donde no hay nada anterior que descartar. */
  onDesdeAqui?: () => void
}) {
  const { t } = useI18n()
  const ws = waterStatusInfo(x.fuente.lastWaterStatus ?? null)
  const nivel = confidenceOf(x.fuente)
  const nombre = nombreFuente(x.fuente, t)
  return (
    <ListItem divider alignItems="flex-start" sx={{ display: 'block', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        {elegible && (
          // A la izquierda del kilómetro y no al final de la fila: es lo primero que se
          // recorre con la vista al decidir cuáles llevarse, y al final quedaría por
          // debajo de los chips de reseña, que son otra cosa distinta.
          <Checkbox
            checked={llevar}
            onChange={onLlevar}
            size={movil ? 'medium' : 'small'}
            slotProps={{ input: { 'aria-label': t('gpxIn.takeAria', { name: nombre }) } }}
            sx={{ p: movil ? 1.5 : 0.5, ml: movil ? -1.5 : -0.5, alignSelf: 'center' }}
          />
        )}
        {/* El kilómetro primero y en negrita: es por lo que se lee esta lista. */}
        <Typography sx={{ fontWeight: 800, minWidth: 62 }}>{t('gpxIn.km', { km: x.kmRuta.toFixed(1) })}</Typography>
        <Link component={RouterLink} to={`/fonts/${x.fuente.id}`} sx={{ fontWeight: 600 }}>
          {nombre}
        </Link>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ ml: movil ? 0 : '62px' }}>
        {[
          t('gpxIn.detour', { m: String(x.desvioM) }),
          x.eleRutaM !== null ? t('gpxIn.routeEle', { m: String(Math.round(x.eleRutaM)) }) : null,
          // Siempre con emoji delante: en una lista de veinte filas es lo único que se lee
          // de un vistazo, y la pregunta que se trae quien la mira es «¿en cuál lleno el
          // bidón?». La gota dice que mana; el reloj de arena, que hace mucho que nadie
          // pasa.
          //
          // `disputed` gana al último estado: cuando hay partes recientes que se
          // contradicen, decir «sale agua» a secas es peor que no decir nada — es la misma
          // regla que ya aplica `confidenceOf`, aquí llevada a la fila.
          nivel === 'disputed'
            ? `${CONFIDENCE_EMOJI.disputed} ${t(confidenceLabelKey('disputed'))}`
            : ws && x.fuente.lastUpdate
              ? `${ws.emoji} ${t(`status.${ws.key}`)} · ${timeAgo(x.fuente.lastUpdate, t)}`
              : `${CONFIDENCE_EMOJI[nivel]} ${t(confidenceLabelKey(nivel))}`,
        ].filter(Boolean).join(' · ')}
      </Typography>

      {/* «Desde aquí» es el caso que se contó tal cual —sales de casa con el bidón lleno—
          y en una lista de treinta es UN toque en vez de veintinueve. Pisa la selección
          entera en vez de superponerse a las casillas: con dos reglas a la vez habría que
          explicar cuál gana, y aquí lo que se ve marcado es siempre lo que se descarga. */}
      {elegible && onDesdeAqui && (
        <Button size="small" onClick={onDesdeAqui}
                sx={{ textTransform: 'none', ml: movil ? 0 : '54px', mt: 0.25,
                      minHeight: movil ? 48 : undefined }}>
          {t('gpxIn.fromHere')}
        </Button>
      )}

      {/* Contar el estado desde aquí es lo que convierte esta pantalla en datos. Va con la
          misma regla que el atajo de la ficha: reseña **solo con el estado**, sin texto ni
          valoración, y **sin `unknown` ni `gone`**. El primero no dice nada viniendo de
          quien ha pasado por allí, y «ya no está» es el estado más caro —dos testimonios
          retiran la fuente del mapa— así que no se pone a un toque en una lista de veinte.
          Quien de verdad lo quiera decir tiene el formulario entero en la ficha. */}
      {onCuenta && (
        <Box sx={{
          // Sin sangrado en móvil: los 62 px alinean con la columna del kilómetro, pero en
          // un teléfono son un tercio del ancho tirado justo donde hacen falta los
          // objetivos grandes. Alinear importa menos que poder pulsar.
          ml: movil ? 0 : '62px',
          mt: 0.75, gap: 0.75,
          // En móvil, rejilla de dos columnas en vez de dejarlos fluir. A 48 px de alto
          // los cuatro se parten en tres líneas desiguales —«Sale agua» sola, «Poca agua»
          // con «Seca», «Averiada» sola— y cada fuente se come media pantalla. En 2×2
          // ocupan dos líneas parejas y la lista vuelve a ser recorrible.
          ...(movil
            // `minmax(0, 1fr)` y no `1fr` a secas: con `1fr` cada columna crece hasta el
            // ancho de su contenido y salen desiguales —medido, 149 px «Sale agua» contra
            // 131 «Seca»—, que es justo lo que la rejilla venía a evitar.
            ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
            : { display: 'flex', flexWrap: 'wrap' }),
        }}>
          {contado ? (
            <Chip size={movil ? 'medium' : 'small'} color="success" variant="outlined"
                  label={`${WATER_STATUS[contado]?.emoji ?? ''} ${t('gpxIn.counted')}`}
                  sx={movil ? { height: 48, borderRadius: 3, fontSize: 15, gridColumn: '1 / -1' } : undefined} />
          ) : (
            WATER_STATUS_OPTIONS.filter((k) => k !== 'unknown' && k !== 'gone').map((k) => (
              // Rellenos y a 48 px con el pulgar: un chip `outlined` y pequeño se lee
              // como una etiqueta, no como algo que se pulsa. En escritorio se quedan
              // pequeños, que es donde el ratón apunta fino — mismo corte que el resto.
              <Chip key={k} clickable variant={movil ? 'filled' : 'outlined'}
                    size={movil ? 'medium' : 'small'}
                    label={`${WATER_STATUS[k].emoji} ${t(`status.${k}`)}`}
                    onClick={() => onCuenta(k)}
                    sx={movil ? { height: 48, borderRadius: 3, fontSize: 15, px: 0.5, width: '100%' } : undefined} />
            ))
          )}
        </Box>
      )}
    </ListItem>
  )
}
