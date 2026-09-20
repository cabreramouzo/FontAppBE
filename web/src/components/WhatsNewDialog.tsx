import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ExploreIcon from '@mui/icons-material/ExploreOutlined'
import RouteIcon from '@mui/icons-material/RouteOutlined'
import HistoryIcon from '@mui/icons-material/HistoryOutlined'
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmarkOutlined'
import EmojiEventsIcon from '@mui/icons-material/EmojiEventsOutlined'
import WaterDropIcon from '@mui/icons-material/WaterDropOutlined'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { sesiones, useTurno } from '../lib/asks'
import { debeVerNovedades, marcaDe, marcaNovedadesVistas } from '../lib/whatsNew'

/**
 * «Qué hay de nuevo»: lo que ha cambiado **desde la última vez que estuviste**.
 *
 * ## A quién se le enseña, que es toda la gracia
 *
 * Solo a quien **ya usaba la app antes** del cambio. A quien llega hoy no: para él la app
 * entera es nueva, así que un «novedades» le señalaría lo accesorio antes que lo básico —y
 * para eso ya tiene el diálogo de bienvenida. La regla vive en `lib/whatsNew.ts`, con sus
 * tests; aquí solo se decide si le toca el turno.
 *
 * «Ya usaba la app» se deduce de `sesiones()`, que cuenta visitas anteriores en el
 * navegador. En la primera visita de la vida vale 1.
 *
 * ## Y va en la cola de interrupciones
 *
 * No se pinta por su cuenta: pasa por `useTurno`, como todo lo que interrumpe. Esa cola
 * existe porque una vez se apilaron tres avisos en seis segundos y taparon el botón de
 * crear cuenta. Va **detrás de la insignia** —tapar un premio recién ganado con un
 * changelog es cambiar algo suyo por algo nuestro— y **delante de instalar y la encuesta**,
 * que piden un favor.
 *
 * ## Al cerrarlo se marca como visto
 *
 * De cualquier forma que se cierre, incluido el manotazo: insistir con un aviso que ya se
 * ha enseñado una vez es lo que hace que se dejen de leer.
 *
 * Y ese mismo gesto **enciende** los distintivos «nuevo» de la app durante las siguientes
 * visitas de esta persona. Al revés de lo que parece: este diálogo **cuenta** qué hay de
 * nuevo y los distintivos **enseñan dónde está**. Encenderlos antes no serviría de nada,
 * porque quedan detrás de este modal.
 */
export function WhatsNewDialog() {
  const { t } = useI18n()
  const { user, loading } = useAuth()
  const scope = user?.id ?? 'anonymous'

  // Cada novedad lleva la versión en que se estrenó. Se muestran **solo las posteriores a
  // la última que viste**: quien ya leyó las de la v1 ve solo lo de la v2, no otra vez todo.
  // Quien nunca vio ninguna (usuario que ya estaba antes de que esto existiera) las ve
  // todas. `desde` es 0 en ese caso, así que pasan todas.
  const TODAS = [
    { icono: <ExploreIcon color="primary" />, k: 'approach', v: 1 },
    { icono: <RouteIcon color="primary" />, k: 'gpx', v: 1 },
    { icono: <HistoryIcon color="primary" />, k: 'history', v: 1 },
    { icono: <CollectionsBookmarkIcon color="primary" />, k: 'collection', v: 2 },
    { icono: <EmojiEventsIcon color="primary" />, k: 'featured', v: 2 },
    { icono: <WaterDropIcon color="primary" />, k: 'drywater', v: 2 },
  ]
  const desde = marcaDe(scope)?.v ?? 0
  const novedades = TODAS.filter((n) => n.v > desde)

  const [listo, setListo] = useState(false)
  // Además de que le toque, tiene que haber algo que contar: si el filtro deja la lista
  // vacía no se abre nada (no debería pasar —cada versión añade al menos una— pero así no
  // aparece un diálogo en blanco por accidente).
  const abierto = useTurno('news', listo) && novedades.length > 0

  // Se decide **solo cuando la sesión ya está resuelta**. Mientras `loading`, `scope` es
  // «anonymous» aunque haya sesión, y para quien ya vio las novedades bajo su id eso abría
  // el diálogo un instante y lo escondía al resolverse el usuario: un parpadeo en cada
  // entrada, porque la marca «anonymous» nunca llega a escribirse (se cierra solo).
  useEffect(() => {
    if (loading) return
    setListo(debeVerNovedades(scope, sesiones() > 1))
  }, [scope, loading])

  function cerrar() {
    marcaNovedadesVistas(scope, sesiones())
    setListo(false)
  }

  return (
    <Dialog open={abierto} onClose={cerrar} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800 }}>{t('whatsNew.title')}</DialogTitle>
      <DialogContent sx={{ pb: 0 }}>
        <List dense disablePadding>
          {novedades.map((n) => (
            <ListItem key={n.k} disableGutters alignItems="flex-start">
              <ListItemIcon sx={{ minWidth: 40, mt: 0.5 }}>{n.icono}</ListItemIcon>
              <ListItemText
                primary={t(`whatsNew.${n.k}Title`)}
                secondary={t(`whatsNew.${n.k}Body`)}
                slotProps={{ primary: { sx: { fontWeight: 700 } } }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {/* Un enlace a lo que se acaba de contar, no solo un «vale». Un changelog que no
            lleva a ninguna parte se lee y se olvida. */}
        <Button component={RouterLink} to="/gpx" onClick={cerrar} sx={{ mr: 'auto' }}>
          {t('gpxIn.title')}
        </Button>
        <Button variant="contained" disableElevation onClick={cerrar}>{t('whatsNew.gotIt')}</Button>
      </DialogActions>
    </Dialog>
  )
}
