import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
type Mode = 'light' | 'dark'

const KEY = 'fontapp_theme'
const systemMode = (): Mode =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

interface ThemeModeCtx {
  pref: ThemePref
  setPref: (p: ThemePref) => void
  mode: Mode // modo resuelto (system → claro/oscuro real)
}

const Ctx = createContext<ThemeModeCtx | undefined>(undefined)

// Fuente única del tema: fija `data-theme` en <html> (para el CSS) y expone el modo
// resuelto para MUI. 'system' sigue a prefers-color-scheme.
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => (localStorage.getItem(KEY) as ThemePref) || 'system')
  const [sysMode, setSysMode] = useState<Mode>(systemMode)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSysMode(systemMode())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (pref === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', pref)
    localStorage.setItem(KEY, pref)
  }, [pref])

  const mode: Mode = pref === 'system' ? sysMode : pref
  const value = useMemo(() => ({ pref, setPref: setPrefState, mode }), [pref, mode])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeMode() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useThemeMode debe usarse dentro de <ThemeModeProvider>')
  return ctx
}
