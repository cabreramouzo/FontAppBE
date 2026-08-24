import { useEffect, useRef } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { useTurno } from '../lib/asks'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'

// Pop-up de bienvenida que se muestra UNA vez, justo tras registrarse.
export function WelcomeDialog() {
  const { justRegistered, dismissWelcome, user } = useAuth()
  const { t } = useI18n()
  const abierto = useTurno('welcome', justRegistered)
  const backdropClicks = useRef(0)

  useEffect(() => { backdropClicks.current = 0 }, [abierto])

  function close(_event: object, reason: 'backdropClick' | 'escapeKeyDown') {
    if (reason === 'escapeKeyDown') { dismissWelcome(); return }
    backdropClicks.current += 1
    if (backdropClicks.current >= 2) dismissWelcome()
  }

  return (
    <Dialog open={abierto} onClose={close} maxWidth="xs" fullWidth
      slotProps={{ paper: { sx: {
        overflowX: 'hidden', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        maxHeight: 'calc(100dvh - 16px)', m: '8px',
      } } }}>
      {/* Cabecera: la ilustración a ancho completo. En vez de superponer color,
          desvanecemos la PROPIA imagen a transparente por abajo con una máscara,
          dejando ver el fondo del popup → fundido real y tema-aware. */}
      <Box
        component="img"
        src="/welcome.jpg"
        alt="FontApp"
        sx={{
          width: '100%', height: 260, flex: '0 0 auto', objectFit: 'cover', objectPosition: 'center 22%', display: 'block',
          '@media (max-height: 600px)': { height: 120 },
          maskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 96%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 96%)',
        }}
      />
      <DialogContent sx={{ textAlign: 'center', pt: 0, mt: -1, overflow: 'visible', flex: '0 0 auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {user?.name ? t('welcome.greeting', { name: user.name }) : t('welcome.title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {t('welcome.intro')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('welcome.contextual')}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center', flex: '0 0 auto' }}>
        <Button variant="contained" disableElevation fullWidth onClick={dismissWelcome}>
          {t('welcome.cta')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
