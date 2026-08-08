import { useEffect, useRef, useState } from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import InstallMobileIcon from '@mui/icons-material/InstallMobile'
import IosShareIcon from '@mui/icons-material/IosShare'
import { useI18n } from '../i18n/I18nContext'

// Aviso "añade a pantalla de inicio".
// - Android/Chromium: usamos el evento nativo `beforeinstallprompt` para ofrecer
//   instalación real de un toque.
// - iOS Safari: Apple no expone ese evento, así que mostramos la instrucción
//   manual (Compartir → Afegeix a la pantalla d'inici).
// No se muestra si ya está instalada (standalone). Si el usuario lo descarta, NO
// desaparece para siempre: guardamos la fecha y volvemos a ofrecerlo pasado un mes
// (por si lo cerró sin querer o cambió de idea). Una vez instalada, `isStandalone`
// evita seguir insistiendo.
const STORAGE_KEY = 'fontapp_install_hint'
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // ~1 mes

// ¿Se descartó hace menos de un mes? (valores antiguos "1" cuentan como caducados).
function dismissedRecently(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return false
    const ts = Number(v)
    return Number.isFinite(ts) && Date.now() - ts < COOLDOWN_MS
  } catch {
    return false
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS se presenta como Mac con pantalla táctil.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS expone su propio flag.
    (navigator as unknown as { standalone?: boolean }).standalone === true
}

// ¿La tenemos por instalada? O bien corre en modo app (standalone), o bien la instaló
// antes (evento `appinstalled`, persistido en main.tsx) aunque ahora esté en el navegador.
function isInstalled(): boolean {
  if (isStandalone()) return true
  try {
    return localStorage.getItem('fontapp_installed') === '1'
  } catch {
    return false
  }
}

// La instalación manual solo funciona en Safari; Chrome/Firefox/Edge en iOS no.
function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

export function InstallPrompt() {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<'ios' | 'android'>('ios')
  const deferred = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (dismissedRecently() || isInstalled()) return

    // Android/Chromium: capturamos el evento para lanzar la instalación nosotros.
    const onBip = (e: Event) => {
      e.preventDefault()
      deferred.current = e as BeforeInstallPromptEvent
      setMode('android')
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    // Puede haberse disparado ANTES de montar (lo captura main.tsx en window).
    if (window.__bipEvent) {
      deferred.current = window.__bipEvent as BeforeInstallPromptEvent
      setMode('android')
      setShow(true)
    }

    // iOS Safari: aviso con la instrucción manual, tras un pequeño retardo.
    let timer: number | undefined
    if (isIOSSafari()) {
      setMode('ios')
      timer = window.setTimeout(() => setShow(true), 3000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      if (timer) clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    // Guardamos la fecha del descarte: reaparecerá pasado el enfriamiento (~1 mes).
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* modo privado: da igual */ }
    setShow(false)
  }

  async function install() {
    const d = deferred.current
    if (!d) return
    await d.prompt()
    await d.userChoice
    dismiss() // instale o no, no volvemos a insistir
  }

  if (!show) return null

  return (
    <Paper
      square
      elevation={0}
      role="status"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
    >
      <InstallMobileIcon color="primary" fontSize="small" />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('install.title')}</Typography>
        {mode === 'ios' && (
          <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            {t('install.iosPre')} <IosShareIcon sx={{ fontSize: 16 }} /> {t('install.iosPost')}
          </Typography>
        )}
      </Box>
      {mode === 'android' && (
        <Button size="small" variant="contained" disableElevation onClick={install}>
          {t('install.button')}
        </Button>
      )}
      <IconButton size="small" onClick={dismiss} aria-label={t('form.cancel')}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  )
}
