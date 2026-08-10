import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import { describeError, unsubscribeWeekly } from '../api/client'
import { useI18n } from '../i18n/I18nContext'

// Baja del resumen semanal desde el enlace del correo. Se llega SIN sesión (el usuario
// viene de su buzón), así que la credencial es el token firmado de la propia URL.
// Damos la baja al entrar, sin pedir confirmación: quien pulsa "dejar de recibirlo" ya
// ha decidido, y una pantalla extra solo consigue que acabe marcándote como spam.
export function UnsubscribePage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [error, setError] = useState('')
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return // React 18 monta dos veces en desarrollo
    done.current = true
    const user = params.get('u')
    const token = params.get('t')
    if (!user || !token) {
      setState('error')
      setError(t('unsub.badLink'))
      return
    }
    unsubscribeWeekly(user, token)
      .then(() => setState('done'))
      .catch((e) => { setState('error'); setError(describeError(e, t)) })
  }, [params, t])

  return (
    <Box className="pad" sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center' }}>
      <Typography variant="h5" sx={{ my: 2, fontWeight: 700 }}>{t('unsub.title')}</Typography>
      {state === 'working' && <Typography color="text.secondary">{t('unsub.working')}</Typography>}
      {state === 'done' && (
        <>
          <Alert severity="success" sx={{ textAlign: 'left' }}>{t('unsub.done')}</Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{t('unsub.reenable')}</Typography>
        </>
      )}
      {state === 'error' && <Alert severity="error" sx={{ textAlign: 'left' }}>{error}</Alert>}
      <Button component={RouterLink} to="/" variant="contained" disableElevation sx={{ mt: 3 }}>
        {t('unsub.backMap')}
      </Button>
    </Box>
  )
}
