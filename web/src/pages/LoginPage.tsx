import { useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { describeError } from '../api/client'

// Formulario de INICIO DE SESIÓN, en su propia URL y sin mezclarse con el registro.
//
// Por qué está así (importa para los gestores de contraseñas):
// - Un solo propósito por página: el <form> nunca cambia de forma, así Safari/Chrome
//   lo clasifican una vez y bien (antes login/registro compartían los mismos <input>
//   y les cambiábamos el `autocomplete` sobre la marcha).
// - Se llega con una carga real de documento (enlaces <a href>, no client-side), de
//   modo que el formulario EXISTE cuando el navegador analiza la página. Si aparece
//   más tarde (SPA + chunk lazy), iOS no lo reconoce y acaba ofreciendo correos de
//   Contactos en vez de la credencial guardada.
// - `autocomplete`: username + current-password, y la etiqueta NO menciona "correo"
//   (Safari la lee y clasificaría el campo como email de Contactos).
export function LoginPage() {
  const { login } = useAuth()
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      // Navegación REAL (no client-side): así el navegador ve una transición de página
      // tras enviar el formulario, que es lo que dispara el "¿guardar contraseña?".
      window.location.assign('/')
    } catch (err) {
      setError(describeError(err, t))
      setBusy(false)
    }
  }

  return (
    <Box className="pad auth" sx={{ maxWidth: 360, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{t('login.enter')}</Typography>

      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <TextField
            label={t('login.userLabel')}
            name="username"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            fullWidth
            size="small"
            slotProps={{ htmlInput: { autoComplete: 'username', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }}
          />
          {/* Que también sirva el correo se dice AQUÍ, no en la etiqueta/placeholder/
              helperText: así no entra en el nombre accesible del campo, que es de donde
              las heurísticas de autorrelleno deducen "esto es un email". */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {t('login.userOrEmailHint')}
          </Typography>
        </Box>

        <TextField
          type="password"
          label={t('login.password')}
          name="password"
          id="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          size="small"
          slotProps={{ htmlInput: { autoComplete: 'current-password' } }}
        />

        <Button type="submit" variant="contained" disableElevation disabled={busy}>
          {t('login.enter')}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Typography variant="body2" sx={{ mt: 2 }}>
        <Link href="/forgot-password">{t('login.forgot')}</Link>
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('login.noAccount')} <Link href="/register">{t('login.signup')}</Link>
      </Typography>
    </Box>
  )
}
