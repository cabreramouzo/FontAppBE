import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { UserResponse } from '../api/types'
import { ApiError, apiFetch, getToken, googleLoginRequest, loginRequest, loginWithPasskeyRequest, setToken } from '../api/client'
import { saveSessionForSync } from '../lib/outbox'
import { storedSource } from '../lib/campaign'
import { forgetCapabilities } from '../lib/capabilities'

interface AuthState {
  user: UserResponse | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  loginWithPasskey: () => Promise<void>
  register: (name: string, username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  // True justo tras registrarse (para mostrar el pop-up de bienvenida una vez).
  justRegistered: boolean
  dismissWelcome: () => void
  // Tras cerrar la bienvenida, ofrecemos activar la ubicación (priming).
  promptLocation: boolean
  dismissLocationPrompt: () => void
}

// Guarda la credencial en el gestor del navegador (Chromium: Credential Management
// API). En una SPA el prompt "¿Guardar contraseña?" no salta solo tras un login por
// fetch + navegación JS; esto lo dispara explícitamente. No soportado en Firefox/Safari
// (esos se apoyan en la heurística del formulario) → detección de soporte y silencioso.
function storeCredential(username: string, password: string) {
  try {
    const PC = (window as unknown as { PasswordCredential?: new (d: { id: string; password: string }) => Credential }).PasswordCredential
    if (PC && window.isSecureContext && navigator.credentials?.store) {
      void navigator.credentials.store(new PC({ id: username, password }))
    }
  } catch {
    /* no soportado o rechazado por el usuario: da igual */
  }
}

// Tras registrarse hacemos una navegación REAL a "/" (para que el navegador ofrezca
// guardar la contraseña), y eso recarga la app entera: cualquier estado en memoria se
// pierde, incluido el "acabo de registrarme" que abre la bienvenida. Lo dejamos escrito
// aquí para recogerlo al arrancar. `sessionStorage` y no `localStorage`: vale para esta
// pestaña y este rato, que es justo lo que dura el paso entre el registro y la portada.
const JUST_REGISTERED_KEY = 'fontapp_just_registered'

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [justRegistered, setJustRegistered] = useState(false)
  const [promptLocation, setPromptLocation] = useState(false)

  useEffect(() => {
    async function restore() {
      // Gancho de QA local: permite revisar las tres páginas sin crear cuentas basura.
      // Vite elimina esta rama del build de producción.
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('welcome')) {
        setJustRegistered(true)
      }
      // Se consume una sola vez: si el usuario recarga la portada, ya no reaparece.
      if (sessionStorage.getItem(JUST_REGISTERED_KEY)) {
        sessionStorage.removeItem(JUST_REGISTERED_KEY)
        setJustRegistered(true)
      }
      const stored = getToken()
      if (stored) {
        void saveSessionForSync(stored)   // el id llega abajo, al recuperar la sesión
        try {
          const yo = await recuperaSesion()
          setUser(yo)
          // Con el id, para que la cola sepa de quién es cada cosa que guarda.
          void saveSessionForSync(stored, yo.id)
        } catch (e) {
          // La sesión SOLO se cierra si el servidor dice que el token no vale. Un fallo
          // de red no dice nada del token: antes se borraba ante cualquier error, así
          // que recargar sin cobertura —o mientras el servidor despertaba— te dejaba
          // fuera. Y sin sesión, la bandeja de salida tampoco puede enviar lo encolado.
          if (e instanceof ApiError && e.status === 401) setToken(null)
        }
      }
      setLoading(false)
    }
    restore()
  }, [])

  /**
   * Pide el usuario del token guardado, con un reintento si falla la red.
   *
   * El reintento no es por gusto: la máquina del servidor se duerme cuando no hay
   * tráfico y tarda unos segundos en despertar, más de lo que aguanta una petición. Sin
   * él, recargar después de un rato parado se veía como "he perdido la sesión".
   */
  async function recuperaSesion(): Promise<UserResponse> {
    try {
      return await apiFetch<UserResponse>('/auth/me')
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        await new Promise((r) => setTimeout(r, 1500))
        return await apiFetch<UserResponse>('/auth/me')
      }
      throw e
    }
  }

  async function login(username: string, password: string) {
    const res = await loginRequest(username, password)
    setToken(res.token)
    setUser(res.user)
    // Lo que abría el nivel de la sesión anterior no vale para esta.
    forgetCapabilities()
    // El service worker necesita el token en IndexedDB para poder enviar la cola
    // en segundo plano (Android); no puede leer localStorage.
    void saveSessionForSync(res.token, res.user.id)
    storeCredential(username, password)
  }

  async function loginWithGoogle(credential: string) {
    const res = await googleLoginRequest(credential)
    setToken(res.token)
    setUser(res.user)
    forgetCapabilities()
    void saveSessionForSync(res.token, res.user.id)
    // Google también puede CREAR la cuenta. El servidor lo distingue para que esa
    // persona no se pierda la bienvenida ni el onboarding contextual.
    if (res.isNewUser) setJustRegistered(true)
  }

  async function loginWithPasskey() {
    const res = await loginWithPasskeyRequest()
    setToken(res.token)
    setUser(res.user)
    forgetCapabilities()
    void saveSessionForSync(res.token, res.user.id)
  }

  async function register(name: string, username: string, email: string, password: string) {
    await apiFetch<UserResponse>('/users', {
      method: 'POST',
      // `lang` localiza el correo de bienvenida. Lo leemos del <html lang>, que fija
      // I18nContext, para no tener que pasar el idioma por toda la cadena de llamadas.
      // `source` es el código del cartel por el que llegó (?p=…), si venía con uno.
      body: JSON.stringify({
        name, username, email, password,
        lang: document.documentElement.lang || undefined,
        source: storedSource(),
      }),
    })
    await login(username, password)
    // Sobrevive a la recarga que hace RegisterPage justo después (ver JUST_REGISTERED_KEY).
    // No lo ponemos también en memoria: se vería un parpadeo de la bienvenida sobre el
    // formulario de registro antes de que la recarga se lleve por delante el estado.
    // El pop-up lo abre `restore()` ya en la portada.
    sessionStorage.setItem(JUST_REGISTERED_KEY, '1')
  }

  async function refresh() {
    if (!getToken()) return
    try {
      setUser(await apiFetch<UserResponse>('/auth/me'))
    } catch {
      // si falla, dejamos el usuario como está
    }
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // token ya inválido: da igual
    }
    setToken(null)
    setUser(null)
    forgetCapabilities()
    void saveSessionForSync(null)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, loginWithGoogle, loginWithPasskey, register, logout, refresh,
      justRegistered,
      dismissWelcome: () => {
        setJustRegistered(false)
        setPromptLocation(true)
      },
      promptLocation,
      dismissLocationPrompt: () => setPromptLocation(false),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
