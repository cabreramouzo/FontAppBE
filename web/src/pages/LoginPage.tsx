import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { describeError, forgotPassword } from '../api/client'

type Mode = 'login' | 'register' | 'forgot'

export function LoginPage() {
  const { login, register } = useAuth()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState<{ devLink: string | null } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (mode === 'login') {
        await login(username, password)
        navigate('/')
      } else if (mode === 'register') {
        await register(name, username, email, password)
        navigate('/')
      } else {
        const res = await forgotPassword(email, lang)
        setSent({ devLink: res.devLink })
      }
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  function switchTo(next: Mode) {
    setMode(next)
    setError('')
    setSent(null)
  }

  const title = mode === 'login' ? t('login.enter') : mode === 'register' ? t('login.createAccount') : t('forgot.title')

  return (
    <Box className="pad auth" sx={{ maxWidth: 360, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{title}</Typography>

      {mode === 'forgot' && sent ? (
        <>
          <Alert severity="success" sx={{ mb: 2 }}>{t('forgot.sent')}</Alert>
          {sent.devLink && (
            <Typography variant="body2" color="text.secondary">
              {t('forgot.devLink')} <Link href={sent.devLink}>{sent.devLink}</Link>
            </Typography>
          )}
          <Button onClick={() => switchTo('login')} sx={{ mt: 1 }}>← {t('login.enter')}</Button>
        </>
      ) : (
        <>
          {/* `key={mode}` remonta los campos al cambiar entre entrar/registrarse. Sin
              esto React reutiliza los mismos <input> y solo cambia su `autocomplete`
              (current-password ↔ new-password); Safari cachea su análisis del formulario
              y acaba autorellenando el campo equivocado. */}
          <Box key={mode} component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mode === 'register' && (
              <TextField label={t('login.name')} name="name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth size="small" slotProps={{ htmlInput: { autoComplete: 'name' } }} />
            )}
            {mode !== 'forgot' && (
              <TextField
                label={mode === 'login' ? t('login.userOrEmail') : t('login.username')}
                name="username"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                fullWidth
                size="small"
                // `name`/`id` + autoComplete son lo que necesita iOS Safari para reconocer
                // este campo como el de usuario y ofrecer Passwords. Sin capitalizar/corregir.
                slotProps={{ htmlInput: { autoComplete: 'username', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }}
              />
            )}
            {mode !== 'login' && (
              <TextField type="email" label={t('login.email')} name="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth size="small" slotProps={{ htmlInput: { autoComplete: 'email', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }} />
            )}
            {mode !== 'forgot' && (
              <TextField type="password" label={t('login.password')} name="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth size="small" slotProps={{ htmlInput: { autoComplete: mode === 'login' ? 'current-password' : 'new-password' } }} />
            )}
            <Button type="submit" variant="contained" disableElevation>
              {mode === 'login' ? t('login.enter') : mode === 'register' ? t('login.register') : t('forgot.submit')}
            </Button>
          </Box>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

          {mode === 'login' && (
            <Typography variant="body2" sx={{ mt: 2 }}>
              <Link component="button" type="button" onClick={() => switchTo('forgot')}>{t('login.forgot')}</Link>
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {mode === 'register' ? t('login.haveAccount') : t('login.noAccount')}
            <Link component="button" type="button" onClick={() => switchTo(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? t('login.enter') : t('login.signup')}
            </Link>
          </Typography>
        </>
      )}
    </Box>
  )
}
