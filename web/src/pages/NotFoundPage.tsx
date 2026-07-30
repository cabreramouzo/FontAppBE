import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="pad notfound">
      <div className="notfound-icon">💧</div>
      <h1>404</h1>
      <p className="muted">{t('notFound.title')}</p>
      <Link to="/">{t('notFound.back')}</Link>
    </div>
  )
}
