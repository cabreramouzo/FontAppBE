import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import CircularProgress from '@mui/material/CircularProgress'
import { describeError, previewWeeklyDigest, sendWeeklyDigest, type DigestResult } from '../api/client'
import { useI18n } from '../i18n/I18nContext'

// Envío manual del resumen semanal (solo propietario). El flujo es a propósito de dos
// pasos —ver primero, enviar después— porque escribir a todos los usuarios no se puede
// deshacer: la vista previa es el mismo cálculo que el envío, sin mandar nada.
export function WeeklyDigestPanel() {
  const { t } = useI18n()
  const [preview, setPreview] = useState<DigestResult | null>(null)
  const [result, setResult] = useState<DigestResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')

  async function loadPreview() {
    setBusy('preview'); setError(''); setResult(null)
    try {
      setPreview(await previewWeeklyDigest())
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setBusy(null)
    }
  }

  async function doSend() {
    setConfirm(false); setBusy('send'); setError('')
    try {
      const res = await sendWeeklyDigest()
      setResult(res)
      setPreview(null) // ya no es una previsión: lo que manda es el resultado
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setBusy(null)
    }
  }

  const list = result ?? preview

  return (
    <Box component="section" sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>✉️ {t('digest.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('digest.intro')}</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={loadPreview} disabled={busy !== null}>
          {busy === 'preview' ? <CircularProgress size={20} /> : t('digest.preview')}
        </Button>
        {preview && preview.recipients.length > 0 && (
          <Button variant="contained" color="warning" disableElevation onClick={() => setConfirm(true)} disabled={busy !== null}>
            {busy === 'send' ? <CircularProgress size={20} color="inherit" /> : t('digest.sendNow', { n: String(preview.recipients.length) })}
          </Button>
        )}
      </Box>

      {result && (
        <Alert severity={result.failed > 0 ? 'warning' : 'success'} sx={{ mt: 2 }}>
          {t('digest.sentOk', { n: String(result.recipients.length), failed: String(result.failed) })}
        </Alert>
      )}

      {list && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {t('digest.summary', {
              candidates: String(list.candidates),
              recipients: String(list.recipients.length),
              skipped: String(list.skipped),
            })}
          </Typography>
          {list.recipients.length === 0 && (
            <Typography color="text.secondary" sx={{ mt: 1 }}>{t('digest.nobody')}</Typography>
          )}
          <List disablePadding sx={{ mt: 1 }}>
            {list.recipients.map((r) => (
              <ListItem key={r.username} divider disableGutters
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Chip size="small" label={t('digest.chipActivity', { n: String(r.activityCount) })} />
                    <Chip size="small" variant="outlined" label={t('digest.chipNearby', { n: String(r.nearbyCount) })} />
                  </Box>
                }
              >
                <ListItemText primary={`@${r.username}`} secondary={r.email} />
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t('digest.confirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('digest.confirmBody', { n: String(preview?.recipients.length ?? 0) })}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirm(false)}>{t('form.cancel')}</Button>
          <Button variant="contained" color="warning" disableElevation onClick={doSend}>{t('digest.confirmSend')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
