import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Footer } from './Footer'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">💧 FontApp</Link>
        <nav className="nav">
          <LanguageSwitcher />
          {user ? (
            <>
              <span className="muted">{t('nav.hello', { user: user.username })}</span>
              <button onClick={() => logout()}>{t('nav.logout')}</button>
            </>
          ) : (
            <Link to="/login">{t('nav.enter')}</Link>
          )}
        </nav>
      </header>
      <main className="main">{children}</main>
      <Footer />
    </div>
  )
}
