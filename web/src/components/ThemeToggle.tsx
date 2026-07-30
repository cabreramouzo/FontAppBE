import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/I18nContext'

type Theme = 'system' | 'light' | 'dark'
const KEY = 'fontapp_theme'
const ICON: Record<Theme, string> = { system: '🌗', light: '☀️', dark: '🌙' }
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

// Alterna tema sistema → claro → oscuro. 'system' elimina el atributo y deja mandar
// a prefers-color-scheme; 'light'/'dark' fuerzan el tema vía [data-theme] en <html>.
export function ThemeToggle() {
  const { t } = useI18n()
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme) || 'system')

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem(KEY, theme)
  }, [theme])

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme((cur) => NEXT[cur])}
      title={t('theme.label')}
      aria-label={t('theme.label')}
    >
      {ICON[theme]}
    </button>
  )
}
