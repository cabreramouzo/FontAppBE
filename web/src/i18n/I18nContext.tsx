import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { dictionaries, type Lang } from './dictionaries'

const LANG_KEY = 'fontapp_lang'
const SUPPORTED: Lang[] = ['ca', 'es', 'gl', 'eu', 'en', 'fr', 'pt']

// Idioma inicial: elección guardada → idioma del navegador → catalán por defecto.
function detectLang(): Lang {
  const requested = new URLSearchParams(window.location.search).get('lang') as Lang | null
  if (requested && SUPPORTED.includes(requested)) return requested
  const saved = localStorage.getItem(LANG_KEY) as Lang | null
  if (saved && SUPPORTED.includes(saved)) return saved
  const nav = navigator.language?.slice(0, 2).toLowerCase() as Lang | undefined
  return nav && SUPPORTED.includes(nav) ? nav : 'ca'
}

type TParams = Record<string, string | number>

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  /** Traduce una clave; `{param}` se sustituye con `params`. Respaldo: catalán, luego la clave. */
  t: (key: string, params?: TParams) => string
}

const Ctx = createContext<I18n | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l)
    setLangState(l)
  }, [])

  const t = useCallback(
    (key: string, params?: TParams) => {
      let s = dictionaries[lang][key] ?? dictionaries.ca[key] ?? key
      if (params) {
        for (const k in params) s = s.replaceAll(`{${k}}`, String(params[k]))
      }
      return s
    },
    [lang],
  )

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>')
  return ctx
}
