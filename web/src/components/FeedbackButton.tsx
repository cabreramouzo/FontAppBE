import { useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import DialogContentText from '@mui/material/DialogContentText'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import { useI18n } from '../i18n/I18nContext'
import { submitFeedback } from '../api/client'

// Botón "sugerencias": mensaje libre + país/email opcionales. Sirve para recoger
// ideas y saber qué zonas se piden (señal para ampliar los datos).
/**
 * @param destacado Botón grande a lo ancho, para la pantalla de apoyar el proyecto. Solo
 *   cambia el disparador: el formulario, el envío y el agradecimiento son los mismos, que
 *   es justo lo que evita que las dos entradas se separen con el tiempo.
 */
export function FeedbackButton({ destacado = false }: { destacado?: boolean } = {}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [country, setCountry] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  function close() {
    setOpen(false)
    // Reset diferido para no ver el formulario vaciarse durante el cierre.
    setTimeout(() => { setMessage(''); setCountry(''); setEmail(''); setDone(false) }, 200)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSaving(true)
    try {
      await submitFeedback({
        message: message.trim(),
        country: country.trim() || undefined,
        email: email.trim() || undefined,
      })
      setDone(true)
    } catch {
      // Best-effort: aun si falla, agradecemos y cerramos sin molestar.
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        size={destacado ? 'large' : 'small'}
        fullWidth={destacado}
        variant={destacado ? 'contained' : 'text'}
        disableElevation
        startIcon={<ForumOutlinedIcon />}
        onClick={() => setOpen(true)}
        sx={{ textTransform: 'none' }}
      >
        {destacado ? t('support.feedbackCta') : t('feedback.button')}
      </Button>

      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>💬 {t('feedback.title')}</DialogTitle>
        {done ? (
          <DialogContent>
            <Alert severity="success">{t('feedback.thanks')}</Alert>
          </DialogContent>
        ) : (
          <Box component="form" onSubmit={submit}>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>{t('feedback.intro')}</DialogContentText>
              <TextField
                label={t('feedback.message')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                fullWidth
                multiline
                minRows={3}
                autoFocus
                sx={{ mb: 2 }}
              />
              <TextField
                label={t('feedback.country')}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                fullWidth
                size="small"
                sx={{ mb: 2 }}
              />
              <TextField
                type="email"
                label={t('feedback.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                size="small"
                slotProps={{ htmlInput: { autoComplete: 'email' } }}
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={close}>{t('form.cancel')}</Button>
              <Button type="submit" variant="contained" disableElevation disabled={saving || !message.trim()}>
                {t('feedback.submit')}
              </Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>
    </>
  )
}
