import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
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
type Prefs = { pushFontUpdates?: boolean; pushMentions?: boolean; pushAdmin?: boolean }

export function AvisosDelSistema({ guardar, guardando }: {
  guardar: (patch: Prefs) => Promise<boolean>
  guardando: boolean
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [est, setEst] = useState<EstadoPush | null>(null)
  const [clave, setClave] = useState<string | null | undefined>(undefined)
  const [ocupado, setOcupado] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => { void estado().then(setEst) }, [])
  useEffect(() => { void claveDelServidor().then(setClave) }, [])

  async function cambia(quiere: boolean) {
    setOcupado(true); setFallo(null)
    if (quiere) {
      const r = clave ? await enciende(clave) : { ok: false as const, motivo: 'sin clave' }
      if (!r.ok) setFallo(r.motivo)
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

      {/* Qué avisos, y solo cuando ya están encendidos: preguntarle a alguien qué tipos
          quiere antes de que haya dicho que sí es pedirle dos decisiones para nada.
          Van AGRUPADOS por lo que significan —hechos de una fuente que sigues, alguien
          que te habla, y lo de administración— y no uno por evento: nueve casillas nadie
          las lee, y habría que ampliarlas cada vez que se añade un aviso. */}
      {/* Los tres de dentro NO llevan `size="small"`: esa es otra variante de MUI, con sus
          propias medidas, y el estilo del tema solo viste la normal — quedaban con el
          pulgar descuadrado respecto a los de arriba. La jerarquía la marca la
          indentación, no el tamaño. */}
      {est === 'encendido' && user && (
        <Box sx={{ pl: 2, mt: 0.5, borderLeft: 2, borderColor: 'divider' }}>
          <FormControlLabel
            control={
              <Switch disabled={guardando}
                      checked={user.pushFontUpdates ?? true}
                      onChange={(e) => void guardar({ pushFontUpdates: e.target.checked })} />
            }
            label={<Typography variant="body2">{t('notif.pushFonts')}</Typography>}
          />
          <FormControlLabel
            control={
              <Switch disabled={guardando}
                      checked={user.pushMentions ?? true}
                      onChange={(e) => void guardar({ pushMentions: e.target.checked })} />
            }
            label={<Typography variant="body2">{t('notif.pushMentions')}</Typography>}
          />
          {/* Solo a quien de verdad los recibe. */}
          {user.isAdmin && (
            <FormControlLabel
              control={
                <Switch disabled={guardando}
                        checked={user.pushAdmin ?? true}
                        onChange={(e) => void guardar({ pushAdmin: e.target.checked })} />
              }
              label={<Typography variant="body2">{t('notif.pushAdmin')}</Typography>}
            />
          )}
        </Box>
      )}
      {/* Probarlo en el propio aparato. Solo cuando ya están encendidos: es para
          comprobar que LLEGAN, que es la parte que no se puede ver desde el servidor —y
          la única forma de separar «no funciona el push» de «nadie ha reseñado». */}
      {est === 'encendido' && (
        <Button size="small" sx={{ mt: 0.5, textTransform: 'none' }}
                onClick={() => void prueba().then((r) => { if (!r.ok) setFallo(r.motivo) })}>
          {t('notif.pushTest')}
        </Button>
      )}
      {est === 'denegado' && (
        <Alert severity="info" sx={{ mt: 1 }}>{t('notif.pushDenied')}</Alert>
      )}
      {/* El motivo técnico se ENSEÑA, no se esconde. Los tres fallos posibles —el
          navegador, el servicio de push y nuestra API— llegaban como el mismo «inténtalo
          con cobertura», que además es falso cuando hay wifi de sobra; y en un móvil no
          hay consola donde mirar. Es feo y es lo que permite arreglarlo. */}
      {fallo && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {t('notif.pushFailed')}
          <Box component="code" sx={{ display: 'block', mt: 0.5, fontSize: 11, opacity: 0.8, wordBreak: 'break-word' }}>
            {fallo}
          </Box>
        </Alert>
      )}
    </>
  )
}
