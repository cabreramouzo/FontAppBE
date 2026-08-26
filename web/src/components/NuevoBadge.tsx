import Badge from '@mui/material/Badge'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { sesiones } from '../lib/asks'
import { esNuevoParaTi } from '../lib/whatsNew'

/**
 * Marca algo como **nuevo para esta persona**.
 *
 * No lleva plazo de días a propósito: se apaga cuando quien mira ya ha visto el aviso de
 * novedades, no cuando pasa una semana desde el despliegue. Con un plazo fijo, a quien
 * instala la app el jueves le saldría «nuevo» sobre tres cosas cuando para él lo es todo,
 * y a quien vuelve al octavo día no le saldría nada siendo justo a quien había que
 * avisar. El razonamiento entero está en `lib/whatsNew.ts`.
 *
 * A quien acaba de llegar **nunca** le sale. Y aparece **después** de que lea el aviso de
 * novedades, no antes: antes quedaría detrás del modal y no lo vería nadie.
 */
export function NuevoBadge({ clave, children }: { clave: string; children: ReactNode }) {
  const { t } = useI18n()
  const { user } = useAuth()
  if (!esNuevoParaTi(clave, user?.id ?? 'anonymous', sesiones())) return <>{children}</>
  return (
    <Badge
      color="primary"
      badgeContent={t('whatsNew.badge')}
      // El distintivo se sale del control a propósito: dentro competiría con su rótulo,
      // que es lo que hay que leer. `overlap="circular"` no vale aquí porque esto envuelve
      // tanto un Fab redondo como un botón rectangular.
      sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16, px: 0.5, fontWeight: 700 } }}
    >
      {children}
    </Badge>
  )
}
