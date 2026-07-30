import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

type ToastKind = 'ok' | 'error'
interface ToastState {
  open: boolean
  text: string
  kind: ToastKind
}
interface ToastApi {
  show: (text: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastApi | undefined>(undefined)

// Notificaciones efímeras con Snackbar + Alert de MUI.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ open: false, text: '', kind: 'ok' })

  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    setToast({ open: true, text, kind })
  }, [])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={2600}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.kind === 'error' ? 'error' : 'success'}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ borderRadius: 3 }}
        >
          {toast.text}
        </Alert>
      </Snackbar>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
