import { useEffect, useRef, useState } from 'react'
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
import MobileStepper from '@mui/material/MobileStepper'
import { useTurno } from '../lib/asks'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'

// Pop-up de bienvenida que se muestra UNA vez, justo tras registrarse.
export function WelcomeDialog() {
  const { justRegistered, dismissWelcome, user } = useAuth()
  const { t } = useI18n()
  const abierto = useTurno('welcome', justRegistered)
  const backdropClicks = useRef(0)
  const [page, setPage] = useState(0)

  useEffect(() => { backdropClicks.current = 0; if (abierto) setPage(0) }, [abierto])

  const pages = [
    { title: 'welcome.findTitle', bullets: [['🗺️', 'welcome.b1'], ['💧', 'welcome.b2']] },
    { title: 'welcome.contributeTitle', bullets: [['⭐', 'welcome.b4'], ['➕', 'welcome.b3']] },
    { title: 'welcome.readyTitle', bullets: [['📡', 'welcome.offline'], ['💧', 'welcome.level']] },
  ]
  const current = pages[page]

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
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 750 }}>{t(current.title)}</Typography>
        <List sx={{ textAlign: 'left', pb: 0 }}>
          {current.bullets.map(([emoji, key]) => (
            <ListItem key={key} disableGutters sx={{ py: 0.5, alignItems: 'flex-start' }}>
              <ListItemIcon sx={{ minWidth: 36, fontSize: 22, mt: 0.25 }}>{emoji}</ListItemIcon>
              <ListItemText><Typography variant="body2">{t(key)}</Typography></ListItemText>
            </ListItem>
          ))}
        </List>
        <MobileStepper variant="dots" steps={pages.length} position="static" activeStep={page} sx={{ justifyContent: 'center', bgcolor: 'transparent', p: 0, mt: 1, '& .MuiMobileStepper-dot': { mx: 0.5 } }} nextButton={null} backButton={null} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1, flex: '0 0 auto' }}>
        <Button color="inherit" onClick={page === 0 ? dismissWelcome : () => setPage((n) => n - 1)}>
          {t(page === 0 ? 'welcome.skip' : 'welcome.back')}
        </Button>
        <Button variant="contained" disableElevation sx={{ flexGrow: 1 }} onClick={page === pages.length - 1 ? dismissWelcome : () => setPage((n) => n + 1)}>
          {t(page === pages.length - 1 ? 'welcome.cta' : 'welcome.next')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
