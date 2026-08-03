import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { UserResponse } from '../api/types'
import { apiFetch, getToken, loginRequest, setToken } from '../api/client'

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
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [justRegistered, setJustRegistered] = useState(false)

  useEffect(() => {
    async function restore() {
      if (getToken()) {
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
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, justRegistered, dismissWelcome: () => setJustRegistered(false) }}>
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
