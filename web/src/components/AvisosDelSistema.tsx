import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'
import { apaga, enciende, estado, type EstadoPush } from '../lib/push'

/**
 * Interruptor de las notificaciones del sistema.
 *
 * **Es del aparato, no de la cuenta.** Quien enciende los avisos en el móvil no está
 * diciendo nada sobre su portátil, y el permiso lo concede el navegador. Por eso no viaja
 * con el resto del perfil ni pasa por `savePrivacy`.
 *
 * Los tres estados que no son «encendido» se explican en vez de esconderse:
 * · **no soportado**: en iOS, Web Push solo existe con la app instalada en la pantalla de
 *   inicio. Sin decirlo, esto se lee como que la app está rota — y la salida (instalarla)
 *   está a un enlace.
 * · **denegado**: no se puede volver a preguntar desde la web, nunca. Hay que ir a los
 *   ajustes del navegador, y hay que decirlo o el interruptor parece averiado.
 * · **sin claves en el servidor**: `enciende()` devuelve `false` sin haber pedido ningún
 *   permiso. Gastar el único «permitir» de alguien para nada sería lo peor de todo.
 */
export function AvisosDelSistema() {
  const { t } = useI18n()
  const [est, setEst] = useState<EstadoPush | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [fallo, setFallo] = useState(false)

  useEffect(() => { void estado().then(setEst) }, [])

  async function cambia(quiere: boolean) {
    setOcupado(true); setFallo(false)
    if (quiere) {
      const ok = await enciende()
      if (!ok) setFallo(true)
    } else {
      await apaga()
    }
    setEst(await estado())
    setOcupado(false)
  }

  if (est === null) return null

  if (est === 'no-soportado') {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        {t('notif.pushUnsupported')}
      </Typography>
    )
  }

  return (
    <>
      <FormControlLabel
        sx={{ mt: 1 }}
        control={
          <Switch
            checked={est === 'encendido'}
            disabled={ocupado || est === 'denegado'}
            onChange={(e) => void cambia(e.target.checked)}
          />
        }
        label={t('notif.push')}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {t('notif.pushHint')}
      </Typography>
      {est === 'denegado' && (
        <Alert severity="info" sx={{ mt: 1 }}>{t('notif.pushDenied')}</Alert>
      )}
      {fallo && <Alert severity="warning" sx={{ mt: 1 }}>{t('notif.pushFailed')}</Alert>}
    </>
  )
}
