import { useMemo, type ReactNode } from 'react'
import { createTheme, ThemeProvider, type Theme } from '@mui/material/styles'
import { useThemeMode } from './ThemeModeContext'

/**
 * En móvil, nada que se toque baja de 44 px.
 *
 * Es el mínimo que fija la guía de Apple, y los tamaños **por defecto de MUI están por
 * debajo**: medido a 375 px en las pantallas de la app, el menú de los tres puntos salía a
 * 34, los botones pequeños a 31, los chips pulsables a 32, los interruptores a 38 y las
 * filas del ranking de zonas a 36. No era un componente mal puesto: era el tema.
 *
 * Va **en el tema y no pantalla por pantalla** porque si no hay que acordarse en cada
 * botón nuevo, y el que se olvide no rompe nada — solo deja un objetivo que falla una de
 * cada cinco veces con el pulgar en marcha.
 *
 * Y va **solo hasta `sm`**: en escritorio el ratón apunta fino y estirarlo todo a 44
 * hincharía interfaces densas —el ranking de zonas son cien filas— por un problema que
 * allí no existe. Mismo corte que el resto de la app.
 *
 * Lo que NO se toca: los chips **no pulsables**, que son etiquetas (el estado del agua en
 * las tarjetas de novedades, el `beta` del logotipo). Agrandar una etiqueta no ayuda a
 * nadie y desordena la lectura.
 */
const MIN_TACTIL = 44

const objetivosTactiles = {
  MuiIconButton: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        [theme.breakpoints.down('sm')]: { minWidth: MIN_TACTIL, minHeight: MIN_TACTIL },
      }),
    },
  },
  MuiButton: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        [theme.breakpoints.down('sm')]: { minHeight: MIN_TACTIL },
      }),
    },
  },
  MuiChip: {
    styleOverrides: {
      // Solo los que se pulsan. `clickable` es justo la distinción entre control y
      // etiqueta, y MUI ya la marca por nosotros.
      clickable: ({ theme }: { theme: Theme }) => ({
        [theme.breakpoints.down('sm')]: { height: 'auto', minHeight: MIN_TACTIL },
      }),
    },
  },
  MuiSwitch: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        // El interruptor de MUI lleva el dibujo dentro de un acolchado: subir el alto
        // agranda la zona sensible sin cambiar cómo se ve.
        [theme.breakpoints.down('sm')]: { height: MIN_TACTIL },
      }),
    },
  },
  MuiFab: {
    styleOverrides: {
      // Los flotantes del mapa: el `small` de MUI son 40 px y esta app los usa para las
      // acciones que se tocan andando.
      root: ({ theme }: { theme: Theme }) => ({
        [theme.breakpoints.down('sm')]: { minWidth: MIN_TACTIL, minHeight: MIN_TACTIL },
      }),
    },
  },
  MuiCardActionArea: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        [theme.breakpoints.down('sm')]: { minHeight: MIN_TACTIL },
      }),
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        [theme.breakpoints.down('sm')]: { minHeight: MIN_TACTIL },
      }),
    },
  },
}

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
        components: objetivosTactiles,
      }),
    [mode],
  )
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
