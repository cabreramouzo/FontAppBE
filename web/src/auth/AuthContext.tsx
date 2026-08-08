import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { UserResponse } from '../api/types'
import { apiFetch, getToken, loginRequest, setToken } from '../api/client'
import { saveSessionForSync } from '../lib/outbox'

interface AuthState {
  user: UserResponse | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
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

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [justRegistered, setJustRegistered] = useState(false)
  const [promptLocation, setPromptLocation] = useState(false)

  useEffect(() => {
    async function restore() {
      const stored = getToken()
      if (stored) {
        void saveSessionForSync(stored)
        try {
          setUser(await apiFetch<UserResponse>('/auth/me'))
        } catch {
          setToken(null)
        }
      }
      setLoading(false)
    }
    restore()
  }, [])

  async function login(username: string, password: string) {
    const res = await loginRequest(username, password)
    setToken(res.token)
    setUser(res.user)
    // El service worker necesita el token en IndexedDB para poder enviar la cola
    // en segundo plano (Android); no puede leer localStorage.
    void saveSessionForSync(res.token)
    storeCredential(username, password)
  }

  async function register(name: string, username: string, email: string, password: string) {
    await apiFetch<UserResponse>('/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, email, password }),
    })
    await login(username, password)
    setJustRegistered(true) // dispara el pop-up de bienvenida
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
    void saveSessionForSync(null)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout, refresh,
      justRegistered,
      dismissWelcome: () => { setJustRegistered(false); setPromptLocation(true) },
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
