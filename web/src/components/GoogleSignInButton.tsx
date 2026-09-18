import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { describeError, trackInteraction } from '../api/client'
import { safeNext } from '../lib/nextParam'

/**
 * Botón «Continuar con Google», compartido por login y registro.
 *
 * Por qué un componente y no copiar el `useEffect` en las dos páginas: la lógica de Google
 * tiene tres trampas que se olvidan al copiar y fallan en silencio —el efecto corre **una
 * sola vez** (los valores que cambian se leen por `ref`, o el botón se destruye y reconstruye
 * en cada render, que en el móvil se ve como un parpadeo), el script se carga una vez y se
 * comparte por `data-fontapp-google`, y el `next` sobrevive al desvío—. Con dos copias, la
 * segunda se queda vieja sola.
 *
 * Para el servidor login y alta con Google son lo mismo: `loginWithGoogle` crea la cuenta si
 * no existe (`isNewUser`). Así que el mismo botón sirve en las dos páginas; medido aparte,
 * la gran mayoría de las cuentas entran por aquí, así que va **arriba del todo**.
 */
export function GoogleSignInButton({ setBusy, setError }: {
  setBusy: (v: boolean) => void
  setError: (v: string) => void
}) {
  const { loginWithGoogle } = useAuth()
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  // `loginWithGoogle` y `t` cambian de identidad en cada render de `AuthProvider`/i18n. Si
  // el efecto dependiera de ellos, se re-ejecutaría y volvería a llamar a `initialize` +
  // `renderButton`, destruyendo y reconstruyendo el botón —parpadeo de unos segundos,
  // reportado en el móvil—. Se leen por `ref` para que el callback siga fresco sin re-montar.
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
      // Idempotente: si el botón ya está en el contenedor, no se vuelve a pintar. GSI mete
      // su `<div>` de forma síncrona, así que un segundo `render()` —remontaje, carrera del
      // script de GSI, o un reajuste del viewport en móvil— encuentra el contenedor lleno y
      // se calla en vez de destruir y reconstruir el botón, que es el parpadeo/vibración
      // que se reportó (más visible en móvil). El contenedor lo reserva el `<Box>` con
      // `minHeight`, así que tampoco hay salto de layout mientras carga.
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
      script.addEventListener('error', () => { if (!cancelled) setErrorRef.current(tRef.current('login.googleUnavailable')) }, { once: true })
      document.head.appendChild(script)
    }
    return () => { cancelled = true }
    // Una sola vez: los valores que cambian se leen por `ref` (ver arriba).
  }, [])

  return <Box ref={box} sx={{ minHeight: 44, display: 'flex', justifyContent: 'center', mt: 1 }} />
}
