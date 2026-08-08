import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { useI18n } from '../i18n/I18nContext'
import { describeError, resetPassword } from '../api/client'

export function ResetPasswordPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => window.location.assign('/login'), 1800)
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  return (
    <Box className="pad auth" sx={{ maxWidth: 360, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{t('reset.title')}</Typography>
      {!token ? (
        <>
          <Alert severity="error" sx={{ mb: 2 }}>{t('reset.invalid')}</Alert>
          <Button component="a" href="/login">← {t('login.enter')}</Button>
        </>
      ) : done ? (
        <Alert severity="success">{t('reset.done')}</Alert>
      ) : (
        <>
          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              type={show ? 'text' : 'password'}
              label={t('reset.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              size="small"
              slotProps={{
                htmlInput: { autoComplete: 'new-password', minLength: 8 },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShow((s) => !s)}
                        edge="end"
                        size="small"
                        aria-label={t(show ? 'form.hidePassword' : 'form.showPassword')}
                        title={t(show ? 'form.hidePassword' : 'form.showPassword')}
                      >
                        {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button type="submit" variant="contained" disableElevation>{t('reset.submit')}</Button>
          </Box>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </>
      )}
    </Box>
  )
}
