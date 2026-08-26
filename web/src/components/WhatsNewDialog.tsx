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
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { sesiones, useTurno } from '../lib/asks'
import { debeVerNovedades, marcaNovedadesVistas } from '../lib/whatsNew'

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
  const { user } = useAuth()
  const scope = user?.id ?? 'anonymous'
  const [listo, setListo] = useState(false)
  const abierto = useTurno('news', listo)

  useEffect(() => {
    setListo(debeVerNovedades(scope, sesiones() > 1))
  }, [scope])

  function cerrar() {
    marcaNovedadesVistas(scope, sesiones())
    setListo(false)
  }

  const novedades = [
    { icono: <ExploreIcon color="primary" />, k: 'approach' },
    { icono: <RouteIcon color="primary" />, k: 'gpx' },
    { icono: <HistoryIcon color="primary" />, k: 'history' },
  ]

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
