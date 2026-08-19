import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import InstallMobileIcon from '@mui/icons-material/InstallMobile'
import IosShareIcon from '@mui/icons-material/IosShare'
import { sesiones, useTurno } from '../lib/asks'
import { estaInstalada, instalaAhora, instalacionDeUnToque, plataforma } from '../lib/install'
import { useI18n } from '../i18n/I18nContext'
import { TarjetaDeAviso } from './Avisos'

// Aviso "añade a pantalla de inicio".
// - Android/Chromium: usamos el evento nativo `beforeinstallprompt` para ofrecer
//   instalación real de un toque.
// - iOS Safari: Apple no expone ese evento, así que mostramos la instrucción
//   manual (Compartir → Afegeix a la pantalla d'inici).
// No se muestra si ya está instalada (standalone). Si el usuario lo descarta, NO
// desaparece para siempre: guardamos la fecha y volvemos a ofrecerlo pasado un mes
// (por si lo cerró sin querer o cambió de idea). Una vez instalada, `estaInstalada()`
// evita seguir insistiendo. Quién es quién lo decide `lib/install.ts`, no este fichero.
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

export function InstallPrompt() {
  const { t } = useI18n()
  const [listo, setListo] = useState(false)
  const show = useTurno('install', listo)
  const [mode, setMode] = useState<'ios' | 'android'>('ios')

  useEffect(() => {
    if (dismissedRecently() || estaInstalada()) return
    // Nadie instala en su pantalla de inicio algo que ha visto una vez. A partir de la
    // segunda visita ya hay una razón, y de paso deja limpia la pantalla del cartel.
    if (sesiones() < 2) return

    // Android/Chromium: capturamos el evento para lanzar la instalación nosotros.
    const onBip = () => {
      setMode('android')
      setListo(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    // Puede haberse disparado ANTES de montar (lo captura main.tsx en window).
    if (instalacionDeUnToque()) {
      setMode('android')
      setListo(true)
    }

    // iOS Safari: aviso con la instrucción manual, tras un pequeño retardo.
    let timer: number | undefined
    if (plataforma() === 'ios') {
      setMode('ios')
      timer = window.setTimeout(() => setListo(true), 3000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      if (timer) clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    // Guardamos la fecha del descarte: reaparecerá pasado el enfriamiento (~1 mes).
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* modo privado: da igual */ }
    setListo(false)
  }

  async function install() {
    if (!await instalaAhora()) return
    dismiss() // instale o no, no volvemos a insistir
  }

  if (!show) return null

  return (
    <TarjetaDeAviso>
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
    </TarjetaDeAviso>
  )
}
