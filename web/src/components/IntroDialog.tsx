import { useEffect, useRef, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import { useTurno } from '../lib/asks'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { LanguageSwitcher } from './LanguageSwitcher'

const SEEN_KEY = 'fontapp_intro_seen'

// Presentación para VISITANTES no logueados: qué es FontApp. Se muestra una vez
// (persistido en localStorage); no aparece a quien ya tiene sesión.
export function IntroDialog() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [listo, setListo] = useState(false)
  const open = useTurno('intro', listo)
  const backdropClicks = useRef(0)

  useEffect(() => { backdropClicks.current = 0 }, [open])

  useEffect(() => {
    if (loading || user) return // espera a restaurar sesión; no la muestres a logueados
    try {
      if (localStorage.getItem(SEEN_KEY)) return
    } catch { /* sin almacenamiento: la mostramos igualmente */ }
    setListo(true)
  }, [user, loading])

  function close() {
    setListo(false)
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* no se puede persistir: da igual */ }
  }

  function requestClose(_event: object, reason: 'backdropClick' | 'escapeKeyDown') {
    if (reason === 'escapeKeyDown') { close(); return }
    backdropClicks.current += 1
    if (backdropClicks.current >= 2) close()
  }

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: {
        overflowX: 'hidden', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        maxHeight: 'calc(100dvh - 16px)', m: '8px',
      } } }}
    >
      <Box
        component="img"
        src="/welcome.jpg"
        alt="FontApp"
        sx={{
          width: '100%', height: 240, flex: '0 0 auto', objectFit: 'cover', objectPosition: 'center 10%', display: 'block',
          '@media (max-height: 600px)': { height: 112 },
          maskImage: 'linear-gradient(to bottom, #000 0%, #000 28%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 28%, transparent 100%)',
        }}
      />
      {/* Solapamos el contenido sobre la cola desvanecida de la imagen: el degradado
          continúa por detrás del título en vez de cortarse justo encima. */}
      <DialogContent sx={{ textAlign: 'center', pt: 0, mt: -6, overflow: 'visible', flex: '0 0 auto' }}>
        {/* El selector global queda detrás del modal. Intentar usarlo contaba como clic
            en el backdrop, cerraba la presentación y la marcaba para siempre como vista.
            Aquí el idioma cambia en vivo sin abandonar el onboarding. */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
          <Typography variant="body2" color="text.secondary">{t('lang.label')}:</Typography>
          <LanguageSwitcher />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{t('intro.title')}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>{t('intro.lead')}</Typography>

        {/* La historia que originó la idea, destacada. */}
        <Box sx={{ mt: 2, p: 1.5, textAlign: 'left', borderLeft: 3, borderColor: 'primary.main', bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{t('intro.story')}</Typography>
        </Box>
        <Typography sx={{ mt: 2, fontWeight: 600 }}>{t('intro.solves')}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, flexDirection: 'column', gap: 1, flex: '0 0 auto' }}>
        <Button variant="contained" disableElevation fullWidth onClick={close}>{t('intro.cta')}</Button>
        <Typography variant="body2" color="text.secondary">
          <Link href="/register" onClick={close}>{t('intro.register')}</Link>
        </Typography>
      </DialogActions>
    </Dialog>
  )
}
