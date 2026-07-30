import { useMemo, type ReactNode } from 'react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { useThemeMode } from './ThemeModeContext'

// Tema MUI alineado con las variables CSS de la app (mismo azul de acento y
// tipografía del sistema), siguiendo el modo claro/oscuro resuelto.
export function MuiProvider({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode()
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === 'dark' ? '#38bdf8' : '#0ea5e9' },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          button: { textTransform: 'none', fontWeight: 600 },
        },
      }),
    [mode],
  )
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
