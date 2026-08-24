import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import { useI18n } from '../i18n/I18nContext'
import { TarjetaDeAviso } from './Avisos'

const MIN_CHECK_INTERVAL = 60_000

type VersionResponse = { version?: unknown }

/**
 * Detecta un despliegue nuevo aunque `sw.js` no haya cambiado.
 *
 * iOS puede reanimar durante días el JavaScript que dejó suspendido. Por eso se compara
 * el identificador compilado dentro de esta página con un fichero pequeño que genera
 * cada build, tanto al arrancar como al volver del segundo plano. Nunca se recarga sola:
 * quien esté rellenando un formulario conserva el control de cuándo actualizar.
 */
export function AppUpdatePrompt() {
  const { t } = useI18n()
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const lastCheck = useRef(0)

  const check = useCallback(async (force = false) => {
    if (!import.meta.env.PROD || document.visibilityState === 'hidden' || !navigator.onLine) return
    const now = Date.now()
    if (!force && now - lastCheck.current < MIN_CHECK_INTERVAL) return
    lastCheck.current = now

    try {
      const response = await fetch(`/version.json?t=${now}`, { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json() as VersionResponse
      if (typeof data.version === 'string' && data.version !== __BUILD_ID__) {
        setRemoteVersion(data.version)
      }
    } catch {
      // Sin cobertura o durante un despliegue: se volverá a intentar al recuperar foco.
    }
  }, [])

  useEffect(() => {
    void check(true)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    const onPageShow = () => { void check() }
    const onOnline = () => { void check(true) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [check])

  async function update() {
    setUpdating(true)
    try {
      // Acelera también la actualización del SW si ese fichero cambió. La navegación
      // es network-first, de modo que la recarga recoge después el index nuevo.
      const registration = await navigator.serviceWorker?.getRegistration()
      if (registration) {
        // Safari no debe poder dejar el botón cautivo si la comprobación del SW se
        // atasca: el bundle nuevo no depende de que termine esta petición auxiliar.
        await Promise.race([
          registration.update(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 1_500)),
        ])
      }
    } catch {
      // El bundle nuevo puede cargarse igualmente aunque actualizar el SW falle.
    } finally {
      window.location.reload()
    }
  }

  if (!remoteVersion || dismissedVersion === remoteVersion) return null

  return (
    <TarjetaDeAviso>
      <SystemUpdateAltIcon color="primary" fontSize="small" />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('update.available')}</Typography>
        <Typography variant="caption" color="text.secondary">{t('update.body')}</Typography>
      </Box>
      <Button size="small" variant="contained" disableElevation onClick={update} disabled={updating}>
        {updating ? t('update.updating') : t('update.action')}
      </Button>
      <IconButton
        size="small"
        onClick={() => setDismissedVersion(remoteVersion)}
        aria-label={t('update.later')}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </TarjetaDeAviso>
  )
}
