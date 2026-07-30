import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'

export function LoginPage() {
  const { login, register } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (mode === 'login') await login(username, password)
      else await register(name, username, password)
      navigate('/')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="pad auth">
      <h1>{mode === 'login' ? t('login.enter') : t('login.createAccount')}</h1>
      <form onSubmit={submit} className="col">
        {mode === 'register' && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('login.name')} required />
        )}
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('login.username')} required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('login.password')} required />
        <button type="submit">{mode === 'login' ? t('login.enter') : t('login.register')}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        {mode === 'login' ? t('login.noAccount') : t('login.haveAccount')}
        <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
          {mode === 'login' ? t('login.signup') : t('login.enter')}
        </button>
      </p>
    </div>
  )
}
