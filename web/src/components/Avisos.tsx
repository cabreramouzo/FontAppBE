import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'

/**
 * Los avisos que flotan bajo la barra de arriba.
 *
 * ## Por qué es una franja y no un `position: fixed` en cada aviso
 *
 * Estos avisos **iban en flujo**, como una banda entre la barra y `<main>`, y eso rompe
 * el mapa: su alto es `100dvh` menos la barra menos lo que va debajo, o sea una resta
 * que da por hecho que ahí en medio no hay nada. Medido con la banda puesta, el fondo
 * del mapa cae 76 px por debajo de la tab bar, con sus botones dentro, y la página
 * desborda. Se vio en un iPhone.
 *
 * Al arreglarlo, lo primero que se hizo fue darle `fixed` al aviso de instalar. Con dos
 * avisos eso ya no vale: `PendingUploads` **no pasa por la cola de `lib/asks`** —no es
 * una petición sino un estado, y avisar de que tienes algo sin enviar no es opcional—,
 * así que puede coincidir con el de instalar, y dos elementos fijos con el mismo `top`
 * se pintan uno encima del otro.
 *
 * Así que la posición vive **aquí y una sola vez**, y los avisos son hijos que se apilan
 * solos. El que se añada mañana no tiene que acordarse de nada, que es la misma razón
 * por la que `--alto-barra` es una variable y no un número repetido en cinco reglas.
 *
 * El orden importa y es el de urgencia: primero lo que dice que algo **tuyo** está sin
 * enviar, después lo que pide un favor.
 */
export function FranjaDeAvisos({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 'calc(var(--alto-barra) + env(safe-area-inset-top) + 8px)',
        left: 8,
        right: 8,
        zIndex: (theme) => theme.zIndex.appBar,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        // La franja ocupa todo el ancho aunque esté vacía: sin esto se comería los
        // toques del mapa por los lados de las tarjetas.
        pointerEvents: 'none',
      }}
    >
      {children}
    </Box>
  )
}

/** La caja de un aviso. Compartida para que los dos no se separen con el tiempo. */
export function TarjetaDeAviso({ children }: { children: ReactNode }) {
  return (
    <Paper
      elevation={6}
      role="status"
      sx={{
        pointerEvents: 'auto',
        width: '100%',
        maxWidth: 460,
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
      }}
    >
      {children}
    </Paper>
  )
}
