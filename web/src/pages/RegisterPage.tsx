import { useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { esNombreValido } from '../lib/username'
import { describeError, trackInteraction } from '../api/client'

// Formulario de ALTA, en su propia URL (ver la nota de LoginPage: un propósito por
// página para que los gestores de contraseñas clasifiquen bien el formulario).
//
// Aquí conviven `username` y `email`, que es correcto y estándar: `autocomplete=username`
// marca el identificador de la cuenta (el que se guarda en el llavero) y `email` es solo
// un dato del perfil. La contraseña va con `new-password`, que es lo que hace que iOS/
// Chrome ofrezcan generar una contraseña segura.
export function RegisterPage() {
  const { register } = useAuth()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    // Se comprueba **aquí y no solo en el servidor**, que ya lo rechaza. Dos razones: el
    // servidor contesta en castellano —como todos los `reason` de esta API— y esta
    // pantalla se lee en siete idiomas; y un error que llega **después** de enviar el
    // formulario obliga a rellenarlo otra vez para arreglar una letra.
    //
    // La regla es la misma que la del servidor a propósito (ver `lib/username.ts`): un
    // nombre que el servidor aceptara y el parser de menciones no reconociera mandaría
    // los avisos a otra persona.
    if (!esNombreValido(username.trim())) { setError(t('profile.usernameRules')); return }
    setBusy(true)
    try {
      await register(name, username, email, password)
      // Navegación real: el navegador ve la transición y ofrece guardar la credencial.
      window.location.assign('/')
    } catch (err) {
      setError(describeError(err, t))
      setBusy(false)
    }
  }

  return (
    <Box className="pad auth" sx={{ maxWidth: 360, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{t('login.createAccount')}</Typography>

      <Box component="form" onSubmit={(e) => { trackInteraction('auth_register'); void submit(e) }} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label={t('login.name')}
          name="name"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
          size="small"
          slotProps={{ htmlInput: { autoComplete: 'name' } }}
        />

        <TextField
          label={t('login.username')}
          name="username"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          fullWidth
          size="small"
          slotProps={{ htmlInput: { autoComplete: 'username', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }}
          // La regla, siempre a la vista y no solo cuando ya te has equivocado: aquí se
          // elige un nombre para siempre, y enterarse de que no vale al pulsar «crear»
          // es tarde. En rojo solo cuando de verdad está mal.
          error={!!username && !esNombreValido(username.trim())}
          helperText={t('profile.usernameRules')}
        />

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

        <TextField
          type="password"
          label={t('login.password')}
          name="password"
          id="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          size="small"
          slotProps={{ htmlInput: { autoComplete: 'new-password', minLength: 8 } }}
        />

        <Button type="submit" variant="contained" disableElevation disabled={busy}>
          {t('login.register')}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {t('login.haveAccount')} <Link href="/login">{t('login.enter')}</Link>
      </Typography>
    </Box>
  )
}
