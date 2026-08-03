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
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'

// Pop-up de bienvenida que se muestra UNA vez, justo tras registrarse.
export function WelcomeDialog() {
  const { justRegistered, dismissWelcome, user } = useAuth()
  const { t } = useI18n()

  const bullets: Array<{ emoji: string; key: string }> = [
    { emoji: '🗺️', key: 'welcome.b1' },
    { emoji: '💧', key: 'welcome.b2' },
    { emoji: '➕', key: 'welcome.b3' },
    { emoji: '⭐', key: 'welcome.b4' },
  ]

  return (
    <Dialog open={justRegistered} onClose={dismissWelcome} maxWidth="xs" fullWidth
      slotProps={{ paper: { sx: { overflow: 'hidden' } } }}>
      {/* Cabecera: la ilustración a ancho completo, con degradado hacia el
          fondo del popup por abajo para que no tape el texto. */}
      <Box sx={{ position: 'relative', height: 260 }}>
        <Box
          component="img"
          src="/welcome.jpg"
          alt="FontApp"
          sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%', display: 'block' }}
        />
        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: (theme) => `linear-gradient(to bottom, transparent 45%, ${theme.palette.background.paper} 100%)`,
        }} />
      </Box>
      <DialogContent sx={{ textAlign: 'center', pt: 0, mt: -1 }}>
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
      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center' }}>
        <Button variant="contained" disableElevation fullWidth onClick={dismissWelcome}>
          {t('welcome.cta')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
