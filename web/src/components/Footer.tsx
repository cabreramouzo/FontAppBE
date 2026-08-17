import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LocalCafeIcon from '@mui/icons-material/LocalCafe'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from './ToastContext'
import { FeedbackButton } from './FeedbackButton'

// Ko-fi real (ID G5G724DC37). El enlace directo equivale al widget embed, sin
// cargar el script de terceros de Ko-fi.
const KOFI_URL = 'https://ko-fi.com/G5G724DC37'
const BTC_ADDRESS = 'bc1qu29jxn37wwwrqz6f6qyrwsaa8xn72xy9wmeh0w'

export function Footer() {
  const { t } = useI18n()
  const { show } = useToast()
  const [open, setOpen] = useState(false)

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(BTC_ADDRESS)
      show(t('donate.copied'))
    } catch {
      // portapapeles no disponible: no hacemos nada
    }
  }

  return (
    <footer className="footer">
      <Button size="small" startIcon={<FavoriteBorderIcon />} onClick={() => setOpen(true)} sx={{ textTransform: 'none' }}>
        {t('donate.button')}
      </Button>
      <FeedbackButton />
      {/* En móvil el icono de zonas no cabe en la barra: aquí es donde se llega. */}
      <RouterLink to="/zones">{t('zones.title')}</RouterLink>
      {/* La explicación del juego, en el pie y no en la barra: no es algo que se busque
          a diario, pero tiene que estar donde se mira cuando surge la duda. */}
      <RouterLink to="/gamification">{t('gamePage.title')}</RouterLink>
      <RouterLink to="/legal">{t('footer.legal')}</RouterLink>
      <span className="muted">
        {t('footer.dataPrefix')}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        (ODbL) ·{' '}
        <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">
          ICGC
        </a>
        /ACA (CC BY 4.0)
      </span>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>❤️ {t('donate.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('donate.intro')}
          </Typography>

          <Button
            fullWidth
            variant="contained"
            disableElevation
            startIcon={<LocalCafeIcon />}
            component="a"
            href={KOFI_URL}
            target="_blank"
            rel="noreferrer"
            sx={{ textTransform: 'none' }}
          >
            {t('donate.kofi')}
          </Button>

          <Divider sx={{ my: 2 }}>{t('donate.orBtc')}</Divider>

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
              {BTC_ADDRESS}
            </Typography>
            <IconButton size="small" onClick={copyAddress} aria-label={t('donate.copy')} title={t('donate.copy')}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogContent>
      </Dialog>
    </footer>
  )
}
