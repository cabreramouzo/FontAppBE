import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import { getNotifications, markNotificationsRead, type NotificationItem } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { timeAgo } from '../lib/time'
import { rotulo } from '../lib/fontName'

/**
 * La campana: avisos dentro de la app.
 *
 * Existe para no pagar un correo por cada mención. La mayoría las lee alguien que ya está
 * usando la app, y a ésos el correo solo les repite lo que ya tienen delante — el servidor
 * lo sabe (`User.isAround`) y se calla. El correo se queda para quien lleva días sin
 * entrar, que es donde de verdad hace falta.
 *
 * ## Cuándo pregunta
 *
 * Al cargar y **al volver la pestaña al primer plano**, no cada X segundos. Un sondeo
 * constante es exactamente el gasto que esto viene a evitar, y un aviso de mención no es
 * urgente: verlo al volver a mirar la app es suficiente. Sin sesión no pregunta nada.
 */
/**
 * Los avisos de fuentes olvidadas traen cifras y no una frase: «7|6|142».
 *
 * El servidor no sabe en qué idioma lees, y componer allí «7 fuentes que cuidas…» habría
 * congelado el castellano dentro de la base de datos para siempre. Aquí se reparten y las
 * pone el diccionario. Si el formato cambiara, se lee 0 y el aviso sigue siendo legible.
 */
/**
 * Qué ha pasado en una fuente que sigues.
 *
 * El servidor manda un **código** (`review:dry`, `report`, `hidden:retired`) y no una
 * frase, porque no sabe en qué idioma lees — la misma regla que los avisos de fuentes
 * olvidadas. Aquí se convierte en palabras.
 *
 * Un código que no se reconozca cae en el genérico en vez de pintar la clave cruda: los
 * avisos viejos siguen en la bandeja cuando el servidor ya manda códigos nuevos.
 */
function queHaPasado(excerpt: string, quien: string, t: (k: string, v?: Record<string, string>) => string): string {
  const [tipo, detalle] = excerpt.split(':')
  if (tipo === 'review') {
    const estado = detalle ? t(`status.${detalle}`) : ''
    return estado
      ? t('notif.fontUpdate.reviewWithStatus', { user: quien, status: estado })
      : t('notif.fontUpdate.review', { user: quien })
  }
  if (tipo === 'report') return t('notif.fontUpdate.report', { user: quien })
  if (tipo === 'resolved') return t('notif.fontUpdate.resolved')
  if (tipo === 'hidden') {
    return t(detalle === 'retired' ? 'notif.fontUpdate.retired' : 'notif.fontUpdate.duplicate')
  }
  return t('notif.fontUpdate.other')
}

function cifras(excerpt: string): [number, number, number] {
  const [a, b, c] = excerpt.split('|').map((x) => Number(x) || 0)
  return [a ?? 0, b ?? 0, c ?? 0]
}

export function NotificationBell() {
  const { t } = useI18n()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const cargar = useCallback(() => {
    getNotifications()
      .then((r) => { setItems(r.items); setUnread(r.unread) })
      .catch(() => { /* sin conexión o sin sesión: la campana simplemente no aparece */ })
  }, [])

  useEffect(() => {
    cargar()
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [cargar])

  function abrir(e: React.MouseEvent<HTMLElement>) {
    setAnchor(e.currentTarget)
    // Marcar al ABRIR y no al cargar la app: si se marcara al pedirlos, cualquier visita
    // te vaciaría la campana antes de haberla mirado.
    if (unread > 0) {
      setUnread(0)
      markNotificationsRead().catch(() => setUnread(unread))
    }
  }

  // Sin nada que enseñar no se pinta: un icono que nunca hace nada es ruido en la barra.
  if (items.length === 0) return null

  return (
    <>
      <Tooltip title={t('notif.bell')}>
        <IconButton color="inherit" size="small" onClick={abrir} aria-label={t('notif.bell')}>
          <Badge badgeContent={unread} color="error">
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxWidth: 360, width: '92vw' } } }}
      >
        <Typography variant="overline" sx={{ px: 2, color: 'text.secondary', fontWeight: 800 }}>
          {t('notif.bell')}
        </Typography>
        <Divider />
        {items.map((n) => (
          <MenuItem
            key={n.id}
            component={RouterLink}
            // Sin fuente —se borró— el aviso se queda, pero deja de llevar a un 404.
            to={n.fontID ? `/fonts/${n.fontID}` : '/me'}
            onClick={() => setAnchor(null)}
            sx={{
              display: 'block', whiteSpace: 'normal', py: 1,
              ...(!n.read && { bgcolor: 'action.hover' }),
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {n.kind === 'staleGuarded'
                ? t('notif.staleGuarded', { n: String(cifras(n.excerpt)[0]) })
                : n.kind === 'fontUpdate'
                  ? t('notif.fontUpdate', { font: rotulo(n.fontName, t) })
                  : t('notif.mentionedYou', { user: n.actorName, font: rotulo(n.fontName, t) })}
            </Typography>
            {/* El texto que lo provocó. Sin él hay que abrir la ficha para saber si
                corre prisa, y casi nunca corre. */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
              {n.kind === 'staleGuarded'
                ? t('notif.staleGuardedBody', { font: rotulo(n.fontName, t), d: String(cifras(n.excerpt)[2]) })
                : n.kind === 'fontUpdate'
                  ? queHaPasado(n.excerpt, n.actorName, t)
                  : n.excerpt}
            </Typography>
            <Box component="span" sx={{ display: 'block', fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
              {n.createdAt ? timeAgo(n.createdAt, t) : ''}
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
