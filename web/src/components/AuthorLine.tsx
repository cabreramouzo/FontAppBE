import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Tooltip from '@mui/material/Tooltip'
import ShieldIcon from '@mui/icons-material/Shield'
import { Link as RouterLink } from 'react-router-dom'
import type { UserRole } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

/**
 * El violeta del equipo. El mismo de `StaffBadge`, y a propósito: la franja de arriba,
 * el chip de la barra y la firma de un aviso son la misma señal —«esto es del
 * equipo»— vista en tres sitios. Con tres colores distintos habría que aprenderse tres.
 */
export const STAFF_COLOR = '#7c3aed'

/**
 * Distintivo de rol junto al nombre de quien firma un mensaje público.
 *
 * Existe porque un aviso de moderación y una queja de un vecino se veían **exactamente
 * igual**: el mismo «nombre: texto». Y no dicen lo mismo — «esta fuente está duplicada,
 * procedo a borrarla» firmado por un admin es una decisión, y firmado por cualquiera es
 * una opinión. Sin distinguirlos, o no te crees el aviso de verdad, o te crees el que
 * no lo es.
 */
export function StaffTag({ role }: { role: UserRole }) {
  const { t } = useI18n()
  return (
    <Tooltip title={t('staff.tagHint')}>
      <Chip
        size="small"
        icon={<ShieldIcon sx={{ fontSize: 12, color: '#fff !important' }} />}
        label={t(`role.${role}`)}
        sx={{
          height: 18,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          bgcolor: STAFF_COLOR,
          color: '#fff',
          ml: 0.5,
          verticalAlign: 'text-bottom',
          '& .MuiChip-label': { px: 0.5 },
          '& .MuiChip-icon': { ml: 0.5, mr: -0.25 },
        }}
      />
    </Tooltip>
  )
}

/**
 * Nombre de quien firma, enlazado a su perfil y con su distintivo si es del equipo.
 *
 * El nombre puede faltar: una cuenta anonimizada o borrada deja sus mensajes en pie
 * —forman parte de la historia de la fuente— y entonces no hay a dónde enlazar.
 */
export function Autor({ username, staff }: { username: string | null; staff?: UserRole | null }) {
  const { t } = useI18n()
  if (!username) return <Box component="span" sx={{ fontWeight: 700 }}>{t('review.anon')}</Box>
  return (
    <Box component="span" sx={{ fontWeight: 700 }}>
      <Link
        component={RouterLink}
        to={`/users/${encodeURIComponent(username)}`}
        sx={{
          fontWeight: 700,
          textDecoration: 'none',
          // El nombre del equipo va en su color: es lo que se lee antes que el chip.
          color: staff ? STAFF_COLOR : undefined,
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        {username}
      </Link>
      {staff && <StaffTag role={staff} />}
    </Box>
  )
}
