import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Grow from '@mui/material/Grow'
import useMediaQuery from '@mui/material/useMediaQuery'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import SyncProblemIcon from '@mui/icons-material/SyncProblem'
import { descartaPendientes, flushOutbox, isOutboxSyncing, onOutboxChanged, onOutboxSyncState, pendingStatus } from '../lib/outbox'
import { useI18n } from '../i18n/I18nContext'
import { ChipDeAviso, TarjetaDeAviso } from './Avisos'

/**
 * Cuánto tarda el aviso en encogerse a un chip.
 *
 * Tres segundos, y los pidió quien lo sufrió: la tarjeta ocupa un tercio del mapa y con
 * algo pendiente se quedaba ahí indefinidamente. No hacen falta más porque **lo que dice
 * no se pierde** —el chip lleva el mismo rótulo y el mismo recuento— y porque el aviso
 * entero vuelve a salir en cuanto cambia algo: se corta la red, cambia el número de
 * pendientes, caduca la sesión. Se leen tres segundos de algo que ya has leído diez veces
 * en la misma excursión.
 */
const COLAPSA_MS = 3000

// Aviso de aportaciones guardadas sin cobertura. Solo aparece si hay algo pendiente,
// para que nada parezca perdido, y permite forzar el envío sin esperar.
export function PendingUploads() {
  const { t } = useI18n()
  const [count, setCount] = useState(0)
  const [needsAuth, setNeedsAuth] = useState(false)
  /** Guardadas con OTRA cuenta: no pueden salir firmadas por quien está ahora. */
  const [ajenas, setAjenas] = useState(0)
  const [sending, setSending] = useState(isOutboxSyncing)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [recentlySynced, setRecentlySynced] = useState(false)
  /** El aviso ya se ha leído: pasa a chip. Ver `COLAPSA_MS` más abajo. */
  const [encogido, setEncogido] = useState(false)
  const [syncTried, setSyncTried] = useState(false)
  /** Cambia al tocar el chip: rearma el temporizador para que vuelva a encogerse solo. */
  const [expandidoEn, setExpandidoEn] = useState(0)
  // Quien ha pedido menos movimiento no lo tiene: el cambio es instantáneo.
  const sinMovimiento = useMediaQuery('(prefers-reduced-motion: reduce)')
  const duracion = sinMovimiento ? 0 : 220

  const refresh = useCallback(() => {
    void pendingStatus().then(({ count, needsAuth, ajenas }) => {
      setCount(count); setNeedsAuth(needsAuth); setAjenas(ajenas)
    })
  }, [])

  useEffect(() => {
    refresh()
    const off = onOutboxChanged(refresh)
    const offSync = onOutboxSyncState(({ syncing, sent }) => {
      setSending(syncing)
      refresh()
      if (!syncing) setSyncTried(true)
      if (!syncing && sent > 0) setRecentlySynced(true)
    })
    const connectionChanged = () => { setOnline(navigator.onLine); refresh() }
    window.addEventListener('online', connectionChanged)
    window.addEventListener('offline', connectionChanged)
    return () => {
      off()
      offSync()
      window.removeEventListener('online', connectionChanged)
      window.removeEventListener('offline', connectionChanged)
    }
  }, [refresh])

  useEffect(() => {
    if (!recentlySynced) return
    const timer = window.setTimeout(() => setRecentlySynced(false), 4000)
    return () => window.clearTimeout(timer)
  }, [recentlySynced])

  async function sendNow() {
    setSending(true)
    try {
      await flushOutbox(true)   // lo ha pedido la persona: se ignora la marca de «en vuelo»
    } finally {
      setSending(false)
      refresh()
    }
  }

  // El aviso grande se encoge a un chip a los pocos segundos, **también con cosas
  // pendientes**.
  //
  // Antes solo se encogía sin cobertura y sin nada pendiente, con el argumento de que
  // «tienes 3 aportaciones sin enviar» no es un detalle de contexto. El argumento en
  // contra es mejor y lo dio quien lo sufrió en una ruta: la cola puede tardar horas en
  // vaciarse —o no vaciarse nunca, si lo pendiente es de otra cuenta—, y una tarjeta de
  // tres líneas clavada arriba **tapa un tercio del mapa** todo ese rato. Un aviso que no
  // se va deja de leerse; el chip sigue diciendo lo mismo y cabe.
  //
  // Se rearma con cada cambio de estado de verdad —se pierde la red, cambia el número de
  // pendientes, caduca la sesión—, así que lo que es noticia se ve entero; y al tocarlo se
  // despliega y vuelve a encogerse solo, sin tener que cerrarlo.
  //
  // NO se encoge mientras se está enviando ni durante la confirmación de «ya está»: las
  // dos son transitorias y se van solas en cuatro segundos.
  const transitorio = sending || recentlySynced
  useEffect(() => {
    setEncogido(false)
    if (online && count === 0) return
    if (transitorio) return
    const reloj = setTimeout(() => setEncogido(true), COLAPSA_MS)
    return () => clearTimeout(reloj)
  }, [online, count, needsAuth, ajenas, transitorio, expandidoEn])

  if (count === 0 && !recentlySynced && online) return null

  const title = !online
    ? (count > 0 ? t('offline.offlinePending', { n: count }) : t('offline.banner'))
    : sending
      ? t('offline.syncing', { n: count })
      : count === 0
        ? t('offline.synced')
        : t('offline.pending', { n: count })
  const detail = !online
    ? (count > 0 ? t('offline.savedSafe') : t('offline.connectionHint'))
    : count === 0
      ? t('offline.syncedHint')
      : ajenas > 0
        ? t('offline.otherAccount', { n: ajenas })
        : needsAuth
          ? t('offline.needsLogin')
        : syncTried
          ? t('offline.retryHint')
          : t('offline.pendingHint')
  const icon = !online
    ? <CloudOffIcon color="warning" fontSize="small" />
    : sending
      ? <CircularProgress size={20} aria-hidden="true" />
      : count === 0
        ? <CloudDoneIcon color="success" fontSize="small" />
        : <SyncProblemIcon color="warning" fontSize="small" />

  // El chip dice lo mismo que el título de la tarjeta, así que encogerse no esconde nada:
  // con cosas pendientes sale «Pendientes de enviar: 3» y en naranja, que es el color que
  // esta app ya usa para «esto no está resuelto». Solo informativo —sin cobertura y sin
  // nada pendiente— va neutro, para no gritar por algo que no pide nada de ti.
  const pendiente = count > 0
  const chip = (
    <ChipDeAviso>
      <Chip
        size="small"
        color={pendiente ? 'warning' : 'default'}
        icon={pendiente ? <SyncProblemIcon fontSize="small" /> : <CloudOffIcon fontSize="small" />}
        label={title}
        onClick={() => { setEncogido(false); setExpandidoEn(Date.now()) }}
        sx={{
          // **`pointerEvents: 'auto'` no es opcional.** `FranjaDeAvisos` lleva
          // `pointerEvents: 'none'` para no comerse los toques del mapa por los lados de
          // las tarjetas, y quien los vuelve a activar es `TarjetaDeAviso`. El chip se
          // pinta suelto, sin esa caja, así que sin esto **se ve pero no se puede tocar**:
          // se encogía y ya no había forma de volver a desplegarlo. Reportado probándolo
          // en el móvil.
          pointerEvents: 'auto',
          ...(pendiente ? {} : { bgcolor: 'background.paper' }),
          boxShadow: 2,
        }}
      />
    </ChipDeAviso>
  )

  const tarjeta = (
    <TarjetaDeAviso>
      {icon}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>

        {/* La salida que no había.
            Una aportación que no puede salir —de otra cuenta, ya publicada a mano, o
            rechazada de una forma que la cola toma por transitoria— se quedaba
            reintentándose para siempre, con este aviso clavado arriba y un «enviar ahora»
            que no terminaba nunca. Pasó de verdad.

            Va DEBAJO del texto y no entre el texto y el botón de la derecha: ahí quedaba
            embutido entre dos cosas y encogía la columna del mensaje, que es lo que hay
            que leer. La tarjeta crece un poco y se acepta.

            Se pregunta antes porque esto SÍ borra: son datos que solo existen en este
            móvil. Y en texto pequeño, no como botón: la salida tiene que existir, no
            invitar. */}
        {count > 0 && (ajenas > 0 || !sending) && (
          <Button
            size="small" color="inherit"
            // `ml: -1` compensa el acolchado del botón para que su texto quede alineado
            // con el de arriba; sin eso se lee como una tercera columna.
            sx={{ textTransform: 'none', minWidth: 0, opacity: 0.75, ml: -1, mt: 0.25, display: 'flex' }}
            onClick={() => {
              const soloAjenas = ajenas > 0 && ajenas < count
              const n = soloAjenas ? ajenas : count
              if (!confirm(t('offline.discardConfirm', { n: String(n) }))) return
              void descartaPendientes(soloAjenas).then(() => {
                void pendingStatus().then(({ count, needsAuth, ajenas }) => {
                  setCount(count); setNeedsAuth(needsAuth); setAjenas(ajenas)
                })
              })
            }}
          >
            {t('offline.discard')}
          </Button>
        )}
      </Box>
      {count > 0 && online && needsAuth ? (
        // Reintentar no sirve hasta que vuelva a haber sesión: le llevamos al acceso.
        <Button size="small" variant="contained" disableElevation component="a" href="/login">
          {t('nav.enter')}
        </Button>
      ) : count > 0 && online && ajenas < count ? (
        // Si TODAS son de otra cuenta, «enviar ahora» no puede hacer nada: el vaciado las
        // salta a propósito. Ofrecerlo sería el mismo pecado que el bucle que esto vino a
        // arreglar — un botón que se pulsa y no pasa nada.
        <Button size="small" variant="contained" disableElevation onClick={sendNow} disabled={sending}>
          {sending ? t('offline.sending') : t('offline.sendNow')}
        </Button>
      ) : null}
    </TarjetaDeAviso>
  )

  // ## El paso entre los dos estados va con transición
  //
  // Encogerse de golpe se lee como un fallo de pintado, no como una decisión. La tarjeta
  // se pliega por alto (`Collapse`, que es lo único que anima bien un alto automático) y
  // el chip entra creciendo (`Grow`).
  //
  // **Sin animar el alto de la franja.** `FranjaDeAvisos` publica su alto en
  // `--alto-avisos` y de ahí cuelgan el buscador, los controles del mapa y la tarjeta de
  // cercanas. Esa medida se toma al montar y desmontar, no durante la animación, así que
  // con `unmountOnExit` los overlays se recolocan en los extremos del movimiento y no
  // fotograma a fotograma — que además de ser correcto evita medir cien veces por segundo.
  //
  // Con `prefers-reduced-motion` el cambio es instantáneo, como el confeti.
  return (
    <>
      <Collapse in={!encogido} timeout={duracion} unmountOnExit
                sx={{ width: '100%', maxWidth: 460 }}>
        {tarjeta}
      </Collapse>
      <Grow in={encogido} timeout={duracion} unmountOnExit style={{ transformOrigin: 'left center' }}>
        {chip}
      </Grow>
    </>
  )
}
