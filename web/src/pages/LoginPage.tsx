import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { describeError, forgotPassword } from '../api/client'

type Mode = 'login' | 'register' | 'forgot'

export function LoginPage() {
  const { login, register } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState<{ devLink: string | null } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (mode === 'login') {
        await login(username, password)
        navigate('/')
      } else if (mode === 'register') {
        await register(name, username, email, password)
        navigate('/')
      } else {
        const res = await forgotPassword(email)
        setSent({ devLink: res.devLink })
      }
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  function switchTo(next: Mode) {
    setMode(next)
    setError('')
    setSent(null)
  }

  const title = mode === 'login' ? t('login.enter') : mode === 'register' ? t('login.createAccount') : t('forgot.title')

  return (
    <div className="pad auth">
      <h1>{title}</h1>

      {mode === 'forgot' && sent ? (
        <>
          <p className="muted">{t('forgot.sent')}</p>
          {sent.devLink && (
            <p className="muted small">
              {t('forgot.devLink')} <a href={sent.devLink}>{sent.devLink}</a>
            </p>
          )}
          <p><button className="link" onClick={() => switchTo('login')}>← {t('login.enter')}</button></p>
        </>
      ) : (
        <>
          <form onSubmit={submit} className="col">
            {mode === 'register' && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('login.name')} required />
            )}
            {mode !== 'forgot' && (
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('login.username')} required />
            )}
            {mode !== 'login' && (
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('login.email')} required />
            )}
            {mode !== 'forgot' && (
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('login.password')} required />
            )}
            <button type="submit">
              {mode === 'login' ? t('login.enter') : mode === 'register' ? t('login.register') : t('forgot.submit')}
            </button>
          </form>
          {error && <p className="error">{error}</p>}

          {mode === 'login' && (
            <p className="muted small">
              <button className="link" onClick={() => switchTo('forgot')}>{t('login.forgot')}</button>
            </p>
          )}
          <p className="muted">
            {mode === 'register' ? t('login.haveAccount') : t('login.noAccount')}
            <button className="link" onClick={() => switchTo(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? t('login.enter') : t('login.signup')}
            </button>
          </p>
        </>
      )}
    </div>
  )
}
