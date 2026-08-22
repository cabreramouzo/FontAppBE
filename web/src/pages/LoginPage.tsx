import { useEffect, useRef, useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { ApiError, describeError } from '../api/client'

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
  const { login, loginWithGoogle } = useAuth()
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const googleButton = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return
    let cancelled = false
    const render = () => {
      if (cancelled || !googleButton.current || !window.google) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setError('')
          setBusy(true)
          try {
            await loginWithGoogle(credential)
            window.location.assign('/')
          } catch (err) {
            setError(describeError(err, t))
            setBusy(false)
          }
        },
      })
      googleButton.current.replaceChildren()
      window.google.accounts.id.renderButton(googleButton.current, {
        type: 'standard', theme: 'outline', size: 'large', width: 320,
        text: 'continue_with', shape: 'rectangular',
      })
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-fontapp-google]')
    if (existing) {
      if (window.google) render()
      else existing.addEventListener('load', render, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.dataset.fontappGoogle = '1'
      script.addEventListener('load', render, { once: true })
      script.addEventListener('error', () => { if (!cancelled) setError(t('login.googleUnavailable')) }, { once: true })
      document.head.appendChild(script)
    }
    return () => { cancelled = true }
  }, [loginWithGoogle, t])

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
      // Aquí un 401 no es "se te ha caducado la sesión" (el mensaje genérico), sino
      // que las credenciales no son correctas. El backend no distingue si falla el
      // usuario o la contraseña, a propósito: así no se puede sondear qué usuarios existen.
      if (err instanceof ApiError && err.status === 401) setError(t('login.badCredentials'))
      else setError(describeError(err, t))
      setBusy(false)
    }
  }

  return (
    <Box className="pad auth" sx={{ maxWidth: 360, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{t('login.enter')}</Typography>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          <Box ref={googleButton} sx={{ minHeight: 44, display: 'flex', justifyContent: 'center', mt: 1 }} />
          <Divider sx={{ my: 2 }}>{t('login.or')}</Divider>
        </>
      )}

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
