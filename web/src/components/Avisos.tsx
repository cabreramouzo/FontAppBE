import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
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
/**
 * Cómo la franja le dice al mapa cuánto ocupa.
 *
 * Cada aviso avisa al entrar, al salir y al cambiar de contenido, y la franja se mide
 * entera. Se probó con `ResizeObserver`, que es lo natural, y se cambió: **no se pudo
 * verificar**. En el navegador con el que se comprobó esto no entrega ni una llamada
 * —medido aparte, con un div que pasa de 10 a 50 px de alto: cero— porque su entrega va
 * atada al ciclo de pintado. Puede que sea cosa de ese entorno y en un móvil funcione
 * perfectamente, pero eso es exactamente lo que no se puede afirmar sin verlo, y el
 * fallo sería silencioso: los avisos taparían los botones y nadie vería ningún error.
 *
 * Esto, en cambio, cuelga del ciclo de React, que es lo único que aquí se sabe seguro
 * que corre: el aviso entra, mide; se va, mide; cambia el texto, mide. Y lo único que
 * quedaba fuera —que el texto se reparta en otras líneas al girar el móvil— lo cubre
 * `resize`.
 */
const Medir = createContext<() => void>(() => {})

export function FranjaDeAvisos({ children }: { children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null)

  const mide = useCallback(() => {
    const nodo = caja.current
    if (!nodo) return
    const alto = nodo.getBoundingClientRect().height
    // El `+ 8` es el hueco que la franja deja bajo la barra: sin él, lo de debajo sube
    // esos píxeles y el último aviso lo roza.
    document.documentElement.style.setProperty(
      '--alto-avisos', alto > 0 ? `${Math.round(alto) + 8}px` : '0px',
    )
  }, [])

  useEffect(() => {
    mide()
    // Girar el móvil no monta ni desmonta nada, pero puede repartir el texto en otro
    // número de líneas.
    window.addEventListener('resize', mide)
    return () => {
      window.removeEventListener('resize', mide)
      document.documentElement.style.setProperty('--alto-avisos', '0px')
    }
  }, [mide])

  return (
    <Medir.Provider value={mide}>
    <Box
      ref={caja}
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
    </Medir.Provider>
  )
}

/** La caja de un aviso. Compartida para que los dos no se separen con el tiempo. */
export function TarjetaDeAviso({ children }: { children: ReactNode }) {
  const mide = useContext(Medir)
  // Sin lista de dependencias a propósito: también cambia el alto un aviso que se
  // queda pero dice otra cosa («pendientes: 1» → «pendientes: 2», que en otro idioma
  // puede pasar a dos líneas).
  useLayoutEffect(() => {
    mide()
    // Al desmontarse, esta limpieza corre con el nodo **todavía** en el DOM; el
    // microtask la deja para cuando React ya lo ha quitado.
    return () => { queueMicrotask(mide) }
  })

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
