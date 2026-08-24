import { useEffect, useRef } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
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

  const bullets: Array<{ emoji: string; key: string }> = [
    { emoji: '🗺️', key: 'welcome.b1' },
    { emoji: '💧', key: 'welcome.b2' },
    { emoji: '➕', key: 'welcome.b3' },
    { emoji: '⭐', key: 'welcome.b4' },
    // El juego va el último de los cinco a propósito: primero para qué sirve la app y
    // solo después qué se gana por usarla. Al revés parecería que esto va de puntos.
    { emoji: '💧', key: 'welcome.b5' },
  ]

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
        <List sx={{ mt: 1, textAlign: 'left' }}>
          {bullets.map((b) => (
            <ListItem key={b.key} disableGutters sx={{ py: 0.5, alignItems: 'flex-start' }}>
              <ListItemIcon sx={{ minWidth: 36, fontSize: 22, mt: 0.25 }}>{b.emoji}</ListItemIcon>
              <ListItemText><Typography variant="body2">{t(b.key)}</Typography></ListItemText>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center', flex: '0 0 auto' }}>
        <Button variant="contained" disableElevation fullWidth onClick={dismissWelcome}>
          {t('welcome.cta')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
