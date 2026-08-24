import { useLocation, useNavigate } from 'react-router-dom'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Paper from '@mui/material/Paper'
import MapIcon from '@mui/icons-material/Map'
import NewspaperIcon from '@mui/icons-material/Newspaper'
import PublicIcon from '@mui/icons-material/Public'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { trackInteraction } from '../api/client'
import { mainSection } from '../lib/navigation'

/**
 * Navegación principal en móvil, abajo, como espera cualquiera que use un teléfono.
 *
 * La barra de arriba había llegado al final de su cuerda: se apretó dos veces, con la
 * campana quedaban **9 px** de margen a 393 px, **Zonas estaba escondida** en pantallas
 * estrechas (`xs: none`) y solo se llegaba desde el pie, y **Novedades necesitaba una
 * animación** que hiciera zumbar su icono unas cuantas veces para que la gente descubriera
 * que existía. Las tres cosas eran síntomas de lo mismo: cuatro secciones peleando por el
 * hueco que queda a la derecha de un logotipo.
 *
 * Solo en móvil. En pantallas anchas la barra de arriba tiene sitio de sobra y una tab bar
 * abajo sería un préstamo del móvil que allí no significa nada.
 *
 * Lo que **no** baja aquí: la campana y el menú. Un aviso no es un destino, y un cajón de
 * ajustes tampoco — las pestañas son los sitios donde se está, no las cosas que se hacen.
 */
const PESTAÑAS = [
  { seccion: 'map', ruta: '/', icono: <MapIcon />, clave: 'nav.map', event: 'nav_map' },
  { seccion: 'activity', ruta: '/activity', icono: <NewspaperIcon />, clave: 'news.title', event: 'nav_activity' },
  { seccion: 'zones', ruta: '/zones', icono: <PublicIcon />, clave: 'zones.title', event: 'nav_zones' },
  { seccion: 'profile', ruta: '/me', icono: <AccountCircleIcon />, clave: 'nav.profile', event: 'nav_profile' },
] as const

/** Alto de la barra, en píxeles. Lo usan el mapa y sus overlays para dejarle sitio. */
export const ALTO_TAB_BAR = 56

export function TabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { user } = useAuth()

  const seccionActiva = mainSection(pathname)
  const activa = PESTAÑAS.findIndex((p) => p.seccion === seccionActiva)

  return (
    <Paper
      elevation={0}
      sx={{
        display: { xs: 'block', sm: 'none' },
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100,
        borderTop: 1, borderColor: 'divider', borderRadius: 0,
        // El indicador del iPhone se come la fila de abajo: el acolchado va DENTRO de la
        // barra, así que los botones suben y el fondo sigue llegando al borde.
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      <BottomNavigation
        showLabels
        value={activa === -1 ? false : activa}
        onChange={(_, i) => { trackInteraction(PESTAÑAS[i].event); navigate(PESTAÑAS[i].ruta) }}
        sx={{ height: ALTO_TAB_BAR, bgcolor: 'transparent' }}
      >
        {PESTAÑAS.map((p) => (
          <BottomNavigationAction
            key={p.ruta}
            aria-current={p.seccion === seccionActiva ? 'page' : undefined}
            // Sin sesión, «Yo» lleva a entrar: una pestaña que da 401 no es una pestaña.
            onClick={p.ruta === '/me' && !user ? (e) => { e.preventDefault(); navigate('/login') } : undefined}
            label={t(p.clave)}
            icon={p.icono}
            sx={{
              minWidth: 0,
              px: 0.5,
              '& .MuiBottomNavigationAction-label': { fontSize: 11 },
              '&.Mui-selected': { fontWeight: 700 },
              '&.Mui-selected .MuiSvgIcon-root': {
                bgcolor: 'primary.main', color: 'primary.contrastText',
                borderRadius: 999, px: 1.5, boxSizing: 'content-box',
              },
            }}
          />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
