import { useI18n } from '../i18n/I18nContext'
import { LANGS, type Lang } from '../i18n/dictionaries'

// Selector de idioma para la barra superior.
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  return (
    <select
      className="lang-switch"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t('lang.label')}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  )
}
