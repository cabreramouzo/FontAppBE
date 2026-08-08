import { useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import { useI18n } from '../i18n/I18nContext'
import { describeError, forgotPassword } from '../api/client'

// Solicitud de restablecimiento de contraseña, en su propia URL (ver LoginPage).
// Un único campo de correo, sin campos de contraseña, para que ningún gestor lo
// confunda con un formulario de acceso.
export function ForgotPasswordPage() {
  const { t, lang } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<{ devLink: string | null } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await forgotPassword(email, lang)
      setSent({ devLink: res.devLink })
    } catch (err) {
      setError(describeError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box className="pad auth" sx={{ maxWidth: 360, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{t('forgot.title')}</Typography>

      {sent ? (
        <>
          <Alert severity="success" sx={{ mb: 2 }}>{t('forgot.sent')}</Alert>
          {sent.devLink && (
            <Typography variant="body2" color="text.secondary">
              {t('forgot.devLink')} <Link href={sent.devLink}>{sent.devLink}</Link>
            </Typography>
          )}
          <Button component="a" href="/login" sx={{ mt: 1 }}>← {t('login.enter')}</Button>
        </>
      ) : (
        <>
          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              type="email"
              label={t('login.email')}
              name="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              size="small"
              slotProps={{ htmlInput: { autoComplete: 'email', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }}
            />
            <Button type="submit" variant="contained" disableElevation disabled={busy}>
              {t('forgot.submit')}
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

          <Typography variant="body2" sx={{ mt: 2 }}>
            <Link href="/login">← {t('login.enter')}</Link>
          </Typography>
        </>
      )}
    </Box>
  )
}
