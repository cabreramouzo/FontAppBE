import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import { Link as RouterLink } from 'react-router-dom'
import ShieldIcon from '@mui/icons-material/Shield'
import type { UserResponse, UserRole } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

// Violeta: ni el azul de la app ni el ámbar del distintivo "beta", así que no se
// confunde con nada de lo que ya hay en la barra.
const STAFF = '#7c3aed'

/** El rol del usuario, si es del equipo. `null` para un usuario normal o sin sesión. */
export function staffRole(user: UserResponse | null | undefined): UserRole | null {
  if (!user) return null
  if (user.role && user.role !== 'user') return user.role
  // `is_admin` es la columna antigua; sigue habiendo cuentas que solo tienen eso.
  return user.isAdmin ? 'admin' : null
}

/**
 * Franja de color en el borde superior de la pantalla mientras usas una cuenta del
 * equipo.
 *
 * Va fija y por encima de todo a propósito: el problema que resuelve es creerte que
 * estás con tu cuenta normal, y eso pasa justo cuando no estás mirando la barra —
 * en el mapa a pantalla completa, por ejemplo. Cuatro píxeles no molestan, pero se
 * ven siempre y desde el rabillo del ojo.
 */
export function StaffStripe({ role }: { role: UserRole }) {
  return (
    <Box
      aria-hidden
      sx={(theme) => ({
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        bgcolor: STAFF,
        // Por encima de la barra y de los controles del mapa.
        zIndex: theme.zIndex.appBar + 2,
        pointerEvents: 'none',
      })}
      data-role={role}
    />
  )
}

/**
 * Distintivo con el rol, junto al logo. Lleva al panel de administración y hace de
 * aviso de novedades (denuncias + altas), que antes era un botón aparte: dos escudos
 * seguidos no cabían en la barra de un móvil y no decían nada distinto.
 */
export function RoleChip({ role, count = 0 }: { role: UserRole; count?: number }) {
  const { t } = useI18n()
  return (
    <Tooltip title={t('nav.staffWarning')}>
      <Badge badgeContent={count} color="error" overlap="circular">
      <Chip
        component={RouterLink}
        to="/admin"
        clickable
        size="small"
        icon={<ShieldIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
        label={t(`role.${role}`)}
        sx={{
          height: 22,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          bgcolor: STAFF,
          color: '#fff',
          '&:hover': { bgcolor: '#6d28d9' },
          '& .MuiChip-label': { px: 0.75 },
        }}
      />
      </Badge>
    </Tooltip>
  )
}
