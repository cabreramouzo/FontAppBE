import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import IosShareIcon from '@mui/icons-material/IosShare'
import LocalCafeIcon from '@mui/icons-material/LocalCafe'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from '../components/ToastContext'
import { FeedbackButton } from '../components/FeedbackButton'
import { comparteTexto } from '../lib/share'

// Ko-fi real (ID G5G724DC37). El enlace directo equivale al widget embed, sin
// cargar el script de terceros de Ko-fi.
const KOFI_URL = 'https://ko-fi.com/G5G724DC37'
const BTC_ADDRESS = 'bc1qu29jxn37wwwrqz6f6qyrwsaa8xn72xy9wmeh0w'

// El enlace que se comparte lleva su código de campaña, como los carteles: así el panel
// de administración puede decir cuánta gente entró porque un amigo se lo pasó, que es
// justo lo que esta pantalla pretende y lo único que diría si funciona. Se guarda en
// `users.signup_source` al registrarse (primera visita gana).
const ENLACE = 'https://fontapp.net/?p=amigos'

/**
 * Apoyar el proyecto. **Una pantalla y no un diálogo**: lo que se pide aquí —que invites
 * a alguien— no se hace de un vistazo, y un cuadro flotante sobre el mapa invita a
 * cerrarlo.
 *
 * El orden es el mensaje: **primero invitar, después dinero**. Lo que le falta a esta app
 * no son euros, son personas mirando fuentes; y decirlo en ese orden evita que la pantalla
 * se lea como un cepillo.
 */
export function SupportPage() {
  const { t } = useI18n()
  const toast = useToast()
  const [copiado, setCopiado] = useState(false)

  async function compartir() {
    if (await comparteTexto(`${t('support.shareText')} ${ENLACE}`) === 'copiado') {
      toast.show(t('toast.linkCopied'))
    }
  }

  async function copiarBTC() {
    try {
      await navigator.clipboard.writeText(BTC_ADDRESS)
      setCopiado(true)
      toast.show(t('donate.copied'))
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>❤️ {t('support.title')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>{t('support.intro')}</Typography>

      {/* Lo primero y lo más grande. */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('support.inviteTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('support.inviteBody')}</Typography>
        <Button
          fullWidth variant="contained" disableElevation size="large"
          startIcon={<IosShareIcon />} onClick={compartir} sx={{ textTransform: 'none', mb: 1 }}
        >
          {t('support.share')}
        </Button>
        {/* WhatsApp aparte del botón de compartir, y no dentro: es por dónde se mueve esto
            de verdad aquí, y `wa.me` abre la app instalada sin pasar por la hoja del
            sistema. En escritorio abre WhatsApp Web, que también sirve. */}
        <Button
          fullWidth variant="outlined" size="large"
          startIcon={<WhatsAppIcon />}
          component="a"
          href={`https://wa.me/?text=${encodeURIComponent(`${t('support.shareText')} ${ENLACE}`)}`}
          target="_blank" rel="noreferrer"
          sx={{ textTransform: 'none' }}
        >
          {t('support.whatsapp')}
        </Button>
      </Paper>

      {/* Contar qué falla es la otra forma de ayudar que no cuesta dinero, así que va con
          la de invitar y **antes** que la de pagar. Y es la que más rinde en una app tan
          joven: un mensaje bien detallado vale más que un café. */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('support.feedbackTitle')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('support.feedbackBody')}</Typography>
        <FeedbackButton destacado />
      </Paper>

      {/* Y solo después, el dinero. */}
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('support.costsTitle')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('support.costsBody')}</Typography>

      <Button
        fullWidth variant="contained" disableElevation startIcon={<LocalCafeIcon />}
        component="a" href={KOFI_URL} target="_blank" rel="noreferrer"
        sx={{ textTransform: 'none' }}
      >
        {t('donate.kofi')}
      </Button>

      <Divider sx={{ my: 2 }}>{t('donate.orBtc')}</Divider>

      <Typography variant="caption" sx={{ fontWeight: 700 }}>{t('donate.btcLabel')}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flexGrow: 1 }}>
          {BTC_ADDRESS}
        </Typography>
        <IconButton size="small" onClick={copiarBTC} aria-label={t('donate.copy')} title={t('donate.copy')}>
          <ContentCopyIcon fontSize="small" color={copiado ? 'primary' : undefined} />
        </IconButton>
      </Box>
    </Box>
  )
}
