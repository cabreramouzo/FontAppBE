import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Footer } from './Footer'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">💧 FontApp</Link>
        <nav className="nav">
          <ThemeToggle />
          <LanguageSwitcher />
          {user ? (
            <>
              <Link to="/me" className="muted" title={t('nav.profile')}>{t('nav.hello', { user: user.username })}</Link>
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
