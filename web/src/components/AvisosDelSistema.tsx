import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'
import Button from '@mui/material/Button'
import { apaga, claveDelServidor, enciende, estado, prueba, type EstadoPush } from '../lib/push'

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
 * · **sin claves en el servidor**: no se pinta nada. La clave se pide **al montar** y no
 *   al pulsar, por dos razones: así no se ofrece un interruptor que no puede funcionar, y
 *   sobre todo porque Safari exige que el permiso salga del gesto — con un `await` de red
 *   por delante el diálogo se rechaza solo, y en iOS ese intento se gasta igual.
 */
export function AvisosDelSistema() {
  const { t } = useI18n()
  const [est, setEst] = useState<EstadoPush | null>(null)
  const [clave, setClave] = useState<string | null | undefined>(undefined)
  const [ocupado, setOcupado] = useState(false)
  const [fallo, setFallo] = useState(false)

  useEffect(() => { void estado().then(setEst) }, [])
  useEffect(() => { void claveDelServidor().then(setClave) }, [])

  async function cambia(quiere: boolean) {
    setOcupado(true); setFallo(false)
    if (quiere) {
      const ok = clave ? await enciende(clave) : false
      if (!ok) setFallo(true)
    } else {
      await apaga()
    }
    setEst(await estado())
    setOcupado(false)
  }

  // Sin estado todavía, o sin push configurado en el servidor: no se pinta nada.
  if (est === null || clave === undefined) return null
  if (clave === null) return null

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
      {/* Probarlo en el propio aparato. Solo cuando ya están encendidos: es para
          comprobar que LLEGAN, que es la parte que no se puede ver desde el servidor —y
          la única forma de separar «no funciona el push» de «nadie ha reseñado». */}
      {est === 'encendido' && (
        <Button size="small" sx={{ mt: 0.5, textTransform: 'none' }}
                onClick={() => void prueba()}>
          {t('notif.pushTest')}
        </Button>
      )}
      {est === 'denegado' && (
        <Alert severity="info" sx={{ mt: 1 }}>{t('notif.pushDenied')}</Alert>
      )}
      {fallo && <Alert severity="warning" sx={{ mt: 1 }}>{t('notif.pushFailed')}</Alert>}
    </>
  )
}
