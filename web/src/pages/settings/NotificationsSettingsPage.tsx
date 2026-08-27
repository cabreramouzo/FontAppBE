import Typography from '@mui/material/Typography'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import { useI18n } from '../../i18n/I18nContext'
import { AvisosDelSistema } from '../../components/AvisosDelSistema'
import { PantallaDeAjustes, useAjustes } from './comun'

/**
 * Correo y avisos del sistema.
 *
 * Es la pantalla que más gana con la partición: era la mitad del muro de la página
 * anterior —cinco interruptores, cada uno con su párrafo— y aquí tiene sitio para
 * explicarse sin aplastar a las demás.
 */
export function NotificationsSettingsPage() {
  const { t } = useI18n()
  const { user, guardar, guardando, error } = useAjustes()
  if (!user) return null

  return (
    <PantallaDeAjustes titulo={t('notif.title')} error={error}>
      <FormControlLabel
        control={<Switch checked={user.weeklyDigest ?? true} disabled={guardando}
                         onChange={(e) => void guardar({ weeklyDigest: e.target.checked })} />}
        label={t('notif.weekly')}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {t('notif.weeklyHint')}
      </Typography>

      {/* Nace encendido: una mención suele ser alguien hablándote de algo tuyo, y un
          aviso que solo llega si lo activaste antes no llega nunca. El interruptor está
          aquí, y el propio correo lleva su enlace de baja para quien no tenga la sesión
          abierta. */}
      <FormControlLabel
        sx={{ mt: 2 }}
        control={<Switch checked={user.mentionEmails ?? true} disabled={guardando}
                         onChange={(e) => void guardar({ mentionEmails: e.target.checked })} />}
        label={t('notif.mentions')}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {t('notif.mentionsHint')}
      </Typography>

      {/* Los avisos del sistema. Este interruptor NO es una preferencia de la cuenta sino
          de **este aparato**: quien los quiere en el móvil no está diciendo nada sobre su
          portátil, y el permiso lo concede el navegador. Por eso no pasa por `guardar`. */}
      <AvisosDelSistema guardar={guardar} guardando={guardando} />
    </PantallaDeAjustes>
  )
}
