import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import NewspaperIcon from '@mui/icons-material/Newspaper'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import MapOutlinedIcon from '@mui/icons-material/MapOutlined'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { getFlags, getNewUsers } from '../api/client'
import { lastSeenAt } from '../lib/newUsers'
import { marcarNovedadesVistas, programarZumbidos } from '../lib/newsNudge'
import { Footer } from './Footer'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { OfflineBanner } from './OfflineBanner'
import { AppInterestBanner } from './AppInterestBanner'
import { InstallPrompt } from './InstallPrompt'
import { PendingUploads } from './PendingUploads'
import { RoleChip, StaffStripe, staffRole } from './StaffBadge'
import { NotificationBell } from './NotificationBell'
import { MoreMenu } from './MoreMenu'
import { TabBar } from './TabBar'

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [flagCount, setFlagCount] = useState(0)
  const [newUsers, setNewUsers] = useState(0)
  const [confirmLogout, setConfirmLogout] = useState(false)
  // El icono de Novedades se mueve un momento para que se sepa que está ahí (ver
  // `lib/newsNudge.ts`, que es quien decide si toca y lleva la cuenta).
  // Un contador y no un booleano: con `zumbando: true/false`, el segundo zumbido vuelve
  // a poner la misma clase CSS y el navegador no reinicia la animación — comprobado, solo
  // se movía la primera vez de las tres. Con el contador de clave, el icono se vuelve a
  // montar y la animación arranca de cero siempre.
  const [zumbidos, setZumbidos] = useState(0)
  const { pathname } = useLocation()
  const enElMapa = pathname === '/'

  useEffect(() => {
    // Entrar a Novedades apaga el gesto para siempre: ya se ha descubierto la sección.
    if (pathname.startsWith('/activity')) marcarNovedadesVistas()
  }, [pathname])

  useEffect(() => {
    // Solo desde el mapa: es la pantalla donde la gente se queda, y el gesto pretende
    // sacarla de ahí. En cualquier otra página ya está navegando por su cuenta.
    if (!enElMapa) return
    // Respetar la preferencia del sistema no es un detalle de cortesía: para quien tiene
    // trastornos vestibulares, el movimiento inesperado marea de verdad.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    return programarZumbidos(() => setZumbidos((n) => n + 1))
  }, [enElMapa])
  // Rol del equipo (admin/moderador/owner), o null si es una cuenta normal.
  const rol = staffRole(user)

  // Cosas por mirar (solo admins): denuncias pendientes + altas desde la última visita
  // al panel. Van juntas en el mismo distintivo: es "tienes N cosas nuevas ahí dentro".
  useEffect(() => {
    if (!user?.isAdmin) { setFlagCount(0); setNewUsers(0); return }
    getFlags().then((f) => setFlagCount(f.length)).catch(() => {})
    getNewUsers(lastSeenAt()).then((r) => setNewUsers(r.count)).catch(() => {})
  }, [user])

  return (
    <div className="app">
      {rol && <StaffStripe role={rol} />}
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default', pt: 'env(safe-area-inset-top)' }}>
        {/* La fila se había apretado dos veces por `@media` —huecos a la mitad, cosas
            escondidas— y volvía a romperse con cada botón nuevo. Con la campana quedaban
            **9 px** de margen a 393 px: no sobraba un icono concreto, es que iba a cero y
            la tumbaba cualquier variación (otra tipografía, «CA» en vez de «EN», cómo
            dibuje el emoji cada sistema).
            Ahora en móvil el reparto es por **frecuencia**: en la barra solo lo que se
            toca a diario (novedades, campana, perfil) y el resto en `MoreMenu`. Los 4 px
            de hueco se quedan porque los iconos ya traen su propio acolchado. */}
        <Toolbar
          sx={{
            gap: { xs: 0.5, sm: 1 },
            pl: 'max(16px, env(safe-area-inset-left))',
            pr: 'max(16px, env(safe-area-inset-right))',
            // Quien cede el sitio es SIEMPRE el título, nunca un botón. Va sobre la
            // Toolbar y no botón a botón para que valga también para el que se añada
            // mañana sin que nadie se acuerde de esto.
            '& > :not(:first-of-type)': { flexShrink: 0 },
          }}
        >
          {/* "beta" va pegado al nombre como un subíndice tipográfico —alineado por abajo
              y caído unos píxeles bajo la línea base—, no como una etiqueta más de la
              barra: es una propiedad del producto, se lee junto al nombre.
              El rol, en cambio, cuelga DEBAJO. Es lo ancho ("PROPIETARIO") y en la misma
              fila empujaba los botones de la derecha hasta solaparse; en su propio
              renglón no compite por el ancho con el nombre. */}
          <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
            {/* Aquí NO va `overflow: hidden`, y no es un olvido. Lo estuvo, como red de
                seguridad contra un `nowrap` que se pintara encima de los botones — pero el
                chip de «beta» cae 3 px bajo la línea con `position: relative`, o sea que
                sobresale de esta caja **por diseño**, y el recorte se lo comía por abajo.
                La red vive donde toca: en el `textOverflow: ellipsis` del propio nombre,
                que es quien puede no caber. Recortar aquí solo podía mutilar al vecino. */}
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.25, minWidth: 0, maxWidth: '100%' }}>
              <Typography
                component={RouterLink}
                to="/"
                variant="h6"
                sx={{
                  fontWeight: 800, color: 'primary.main', textDecoration: 'none',
                  whiteSpace: 'nowrap', lineHeight: 1.1,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                  // Por debajo de 360 px (iPhone SE de 2016 y similares) el nombre a
                  // tamaño completo ya no cabía y se metía bajo el botón de novedades.
                  // Esto no lo trajo "beta": pasaba igual sin él.
                  '@media (max-width:359.95px)': { fontSize: '1.05rem' },
                }}
              >
                💧 FontApp
              </Typography>
              <Chip
                label="beta"
                size="small"
                color="warning"
                variant="outlined"
                sx={{
                  height: 11,
                  fontSize: 6.5,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                  textTransform: 'uppercase',
                  borderRadius: 0.75,
                  borderWidth: 1,
                  '& .MuiChip-label': { px: 0.3 },
                  flexShrink: 0,
                  // El desplome que lo hace subíndice: alineado abajo con el nombre y
                  // 3 px por debajo de su línea. Con `relative` no reserva ese hueco,
                  // así que no engorda la fila.
                  position: 'relative',
                  top: 3,
                  // En pantallas de menos de 360 px no hay sitio ni para el nombre solo:
                  // el subíndice es lo primero que sobra.
                  '@media (max-width:359.95px)': { display: 'none' },
                }}
              />
            </Box>
            {/* 4 px y no 2: "beta" cae 3 px bajo su renglón y con 2 rozaba el chip del rol. */}
            {rol && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                <RoleChip role={rol} count={flagCount + newUsers} />
              </Box>
            )}
          </Box>
          {/* Novedades vive aquí y no sobre el mapa: los botones del mapa hacen cosas
              SOBRE el mapa (filtran, cambian la capa, te centran) y este navega a otra
              página. Mezclados, la columna del mapa se leía como un cajón de sastre. */}
          {/* En móvil esto es una pestaña de abajo; aquí solo se queda donde no hay
              tab bar. Y con ello se va el zumbido: el icono se movía unas cuantas veces
              para que alguien descubriera que Novedades existía, que era un parche a un
              problema de sitio. Una pestaña con su nombre escrito no necesita moverse. */}
          <Tooltip title={t('news.title')}>
            <IconButton
              component={RouterLink}
              to="/activity"
              color="inherit"
              size="small"
              aria-label={t('news.title')}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              <NewspaperIcon
                key={zumbidos}
                sx={{
                  // Un balanceo de campana, no un parpadeo ni un salto: el icono se queda
                  // donde está y solo gira sobre su base, así que llama la atención por
                  // el rabillo del ojo sin mover nada de sitio ni tapar lo de al lado.
                  // Los fotogramas viven en `index.css`, no aquí: Emotion renombra los
                  // @keyframes declarados dentro de `sx` y la animación no llegaba a
                  // existir. Ver el comentario de esa hoja.
                  ...(zumbidos > 0 && { animation: 'fontapp-news-nudge 900ms ease-in-out' }),
                  // Cinturón y tirantes: el efecto ya se decide en JS mirando la
                  // preferencia, pero si algún día se llega aquí por otro camino, no se
                  // mueve igualmente.
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              />
            </IconButton>
          </Tooltip>
          {/* El corazón: apoyar el proyecto. Vive arriba y **solo en móvil**, en el sitio
              que dejó libre la tab bar. No es una pestaña porque no es un lugar donde se
              esté, es algo que se hace una vez; y no es un icono más en escritorio porque
              allí el pie ya lo enseña con su nombre escrito, que se lee mejor. */}
          <Tooltip title={t('support.title')}>
            <IconButton
              component={RouterLink}
              to="/support"
              color="inherit"
              size="small"
              aria-label={t('support.title')}
              sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            >
              <FavoriteBorderIcon />
            </IconButton>
          </Tooltip>
          {/* Zonas: mismo sitio y mismo criterio que Novedades — navega fuera del mapa.
              Se esconde en pantallas estrechas, donde la barra ya iba justa y esta es la
              menos urgente de las dos; se llega igual desde el pie. */}
          <Tooltip title={t('zones.title')}>
            <IconButton
              component={RouterLink}
              to="/zones"
              color="inherit"
              size="small"
              aria-label={t('zones.title')}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              <MapOutlinedIcon />
            </IconButton>
          </Tooltip>
          {/* La campana solo tiene sentido con sesión, y solo se pinta si hay algo:
              un icono que nunca hace nada es ruido en una barra que ya va justa. */}
          {user && <NotificationBell />}
          {/* Tema e idioma se ponen una vez en la vida: en móvil bajan al cajón y aquí
              solo se quedan donde hay sitio de sobra, que es donde un control suelto se
              ve y se toca mejor que un menú. */}
          <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}><ThemeToggle /></Box>
          <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}><LanguageSwitcher /></Box>
          {user ? (
            <>
              {/* Perfil: texto con saludo en pantallas anchas; solo icono en móvil para que quepa. */}
              <Button
                component={RouterLink}
                to="/me"
                color="inherit"
                size="small"
                sx={{ textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}
                title={t('nav.profile')}
              >
                {t('nav.hello', { user: user.username })}
              </Button>
              {/* El icono de perfil se ha ido a las pestañas: en móvil aquí no queda
                  nada suyo. */}
              {/* Salir: botón con texto en anchas. En móvil ya no es un icono suelto
                  al lado del de perfil —era un vecino peligroso de tocar sin querer—,
                  vive en el cajón. Sigue pidiendo confirmación igual. */}
              <Button variant="contained" size="small" disableElevation onClick={() => setConfirmLogout(true)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
                {t('nav.logout')}
              </Button>
            </>
          ) : (
            // Enlace normal (no client-side): carga el documento para que el formulario
            // de acceso exista cuando el navegador lo analiza (autorrelleno fiable).
            <Button component="a" href="/login" variant="contained" size="small" disableElevation>{t('nav.enter')}</Button>
          )}
          {/* El último de la fila, que es donde se busca un menú de desbordamiento. */}
          <Box sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
            <MoreMenu onLogout={user ? () => setConfirmLogout(true) : undefined} />
          </Box>
        </Toolbar>
      </AppBar>
      <OfflineBanner />
      <InstallPrompt />
      <PendingUploads />
      <Box component="main" className="main">{children}</Box>

      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t('logout.confirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('logout.confirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmLogout(false)}>{t('form.cancel')}</Button>
          <Button variant="contained" color="error" disableElevation onClick={() => { setConfirmLogout(false); logout() }}>
            {t('nav.logout')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* En el mapa y en móvil, fuera: la tab bar ya ocupa esa franja y Leaflet pinta su
          propia atribución de OSM abajo a la derecha, así que la licencia sigue cubierta.
          En el resto de páginas se queda al final del contenido, con la atribución
          completa y lo legal. */}
      <Box sx={enElMapa ? { display: { xs: 'none', sm: 'block' } } : undefined}><Footer /></Box>
      <TabBar />
      <AppInterestBanner />
    </div>
  )
}
