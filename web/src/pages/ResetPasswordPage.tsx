import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext'
import { describeError, resetPassword } from '../api/client'

export function ResetPasswordPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 1800)
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (!token) {
    return (
      <div className="pad auth">
        <h1>{t('reset.title')}</h1>
        <p className="error">{t('reset.invalid')}</p>
        <Link to="/login">← {t('login.enter')}</Link>
      </div>
    )
  }

  return (
    <div className="pad auth">
      <h1>{t('reset.title')}</h1>
      {done ? (
        <p className="muted">✅ {t('reset.done')}</p>
      ) : (
        <>
          <form onSubmit={submit} className="col">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('reset.password')}
              required
            />
            <button type="submit">{t('reset.submit')}</button>
          </form>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  )
}
