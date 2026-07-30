import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/I18nContext'

// Aviso fijo cuando el navegador pierde la conexión.
export function OfflineBanner() {
  const { t } = useI18n()
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null
  return <div className="offline-banner">📴 {t('offline.banner')}</div>
}
