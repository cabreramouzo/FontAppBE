import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Footer } from './Footer'

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">💧 FontApp</Link>
        <nav className="nav">
          {user ? (
            <>
              <span className="muted">Hola, {user.username}</span>
              <button onClick={() => logout()}>Salir</button>
            </>
          ) : (
            <Link to="/login">Entrar</Link>
          )}
        </nav>
      </header>
      <main className="main">{children}</main>
      <Footer />
    </div>
  )
}
