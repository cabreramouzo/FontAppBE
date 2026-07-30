import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext'

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="footer">
      <Link to="/legal">{t('footer.legal')}</Link>
      <span className="muted">
        {t('footer.dataPrefix')}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        (ODbL)
      </span>
    </footer>
  )
}
