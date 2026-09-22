import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { describeError, trackInteraction } from '../api/client'
import { safeNext } from '../lib/nextParam'

/** Shared login/registration button. Keep the SDK isolated from document layout. */
export function GoogleSignInButton({ setBusy, setError }: {
  setBusy: (v: boolean) => void
  setError: (v: string) => void
}) {
  const { loginWithGoogle } = useAuth()
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  // Read changing callbacks through refs without rebuilding Google's iframe.
  const loginGoogleRef = useRef(loginWithGoogle)
  loginGoogleRef.current = loginWithGoogle
  const tRef = useRef(t)
  tRef.current = t
  const setBusyRef = useRef(setBusy)
  setBusyRef.current = setBusy
  const setErrorRef = useRef(setError)
  setErrorRef.current = setError

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return
    let cancelled = false
    const render = () => {
      if (cancelled || !box.current || !window.google) return
      // Script load and StrictMode must not render the same button twice.
      const width = Math.min(320, Math.max(1, box.current.clientWidth - 20))
      if (box.current.childElementCount > 0) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          trackInteraction('auth_google')
          setErrorRef.current('')
          setBusyRef.current(true)
          try {
            await loginGoogleRef.current(credential)
            await trackInteraction('auth_google_success')
            window.location.assign(safeNext() ?? '/')
          } catch (err) {
            trackInteraction('auth_google_error')
            setErrorRef.current(describeError(err, tRef.current))
            setBusyRef.current(false)
          }
        },
      })
      window.google.accounts.id.renderButton(box.current, {
        type: 'standard', theme: 'outline', size: 'large', width,
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
      script.addEventListener('error', () => { if (!cancelled) setErrorRef.current(tRef.current('login.googleUnavailable')) }, { once: true })
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
      document.querySelector('script[data-fontapp-google]')?.removeEventListener('load', render)
    }
    // Keep the iframe mounted across auth and translation renders.
  }, [])

  return (
    <Box className="google-sign-in-slot" sx={{ mt: 1 }}>
      <Box ref={box} className="google-sign-in-host" />
    </Box>
  )
}
