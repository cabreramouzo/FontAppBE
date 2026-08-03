import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from './ToastContext'

// TODO(donaciones): dirección de EJEMPLO / placeholder — NO es real ni operativa.
// Sustituir por la dirección Bitcoin propia (y quitar el aviso de placeholder)
// antes de aceptar donaciones reales en producción.
const PLACEHOLDER_BTC_ADDRESS = 'bc1qDEMOexampleplaceholder0notreal0replaceme00'

export function Footer() {
  const { t } = useI18n()
  const { show } = useToast()
  const [open, setOpen] = useState(false)

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(PLACEHOLDER_BTC_ADDRESS)
      show(t('donate.copied'))
    } catch {
      // portapapeles no disponible: no hacemos nada
    }
  }

  return (
    <footer className="footer">
      <RouterLink to="/legal">{t('footer.legal')}</RouterLink>
      <span className="muted">
        {t('footer.dataPrefix')}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        (ODbL)
      </span>
      <Button size="small" startIcon={<FavoriteBorderIcon />} onClick={() => setOpen(true)} sx={{ textTransform: 'none' }}>
        {t('donate.button')}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>❤️ {t('donate.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('donate.intro')}
          </Typography>

          <Typography variant="caption" sx={{ fontWeight: 700 }}>{t('donate.btcLabel')}</Typography>
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1,
              borderRadius: 1, bgcolor: 'action.hover',
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flexGrow: 1 }}
            >
              {PLACEHOLDER_BTC_ADDRESS}
            </Typography>
            <IconButton size="small" onClick={copyAddress} aria-label={t('donate.copy')} title={t('donate.copy')}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Box>

          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('donate.placeholderNote')}
          </Alert>
        </DialogContent>
      </Dialog>
    </footer>
  )
}
