import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { UserResponse } from '../api/types'
import { apiFetch, getToken, loginRequest, setToken } from '../api/client'

interface AuthState {
  user: UserResponse | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (name: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)

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

  async function register(name: string, username: string, password: string) {
    await apiFetch<UserResponse>('/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, password }),
    })
    await login(username, password)
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
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
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
