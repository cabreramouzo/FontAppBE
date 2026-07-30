import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Font, MyComment } from '../api/types'
import { deleteAccount, describeError, getMyComments, getMyFonts } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'

export function ProfilePage() {
  const { user, loading, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      navigate('/login')
      return
    }
    getMyFonts().then(setFonts).catch(() => setFonts([]))
    getMyComments().then(setComments).catch(() => setComments([]))
  }, [user, loading, navigate])

  async function removeAccount() {
    if (!user || !confirm(t('profile.confirmDelete'))) return
    try {
      await deleteAccount(user.id)
      await logout()
      navigate('/')
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (!user) return null

  return (
    <div className="pad profile">
      <Link to="/">{t('detail.backMap')}</Link>
      <h1>{t('nav.profile')}</h1>

      <section>
        <h2>{t('profile.account')}</h2>
        <p><strong>{user.name}</strong> · @{user.username}</p>
        {user.email && <p className="muted">{t('profile.email')}: {user.email}</p>}
        {error && <p className="error">{error}</p>}
        <button className="link danger" onClick={removeAccount}>{t('profile.deleteAccount')}</button>
      </section>

      <section>
        <h2>{t('profile.myFonts')}</h2>
        {fonts === null && <Skeleton lines={2} />}
        {fonts?.length === 0 && <p className="muted">{t('profile.noFonts')}</p>}
        <ul className="list">
          {fonts?.map((f) => (
            <li key={f.id}><Link to={`/fonts/${f.id}`}>{f.name}</Link></li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t('profile.myReviews')}</h2>
        {comments === null && <Skeleton lines={3} />}
        {comments?.length === 0 && <p className="muted">{t('profile.noReviews')}</p>}
        <ul className="list">
          {comments?.map((c) => {
            const ws = waterStatusInfo(c.waterStatus)
            return (
              <li key={c.id}>
                <Link to={`/fonts/${c.fontID}`}>{c.fontName ?? '—'}</Link>
                {ws && <span className="badge small"> {ws.emoji} {t(`status.${ws.key}`)}</span>}
                <span className="muted"> · {c.createdAt ? timeAgo(c.createdAt, t) : ''}</span>
                <p>{c.body}</p>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
