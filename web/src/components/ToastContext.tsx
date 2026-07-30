import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'ok' | 'error'
interface Toast {
  id: number
  text: string
  kind: ToastKind
}
interface ToastApi {
  show: (text: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastApi | undefined>(undefined)

// Notificaciones efímeras (toasts) apiladas abajo; se autodescartan.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, text, kind }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2600)
  }, [])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((tst) => (
          <div key={tst.id} className={'toast ' + tst.kind}>{tst.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
