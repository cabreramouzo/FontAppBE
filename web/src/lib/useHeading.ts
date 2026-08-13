import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hacia dónde mira el usuario, en grados desde el norte (0 = norte, 90 = este).
 *
 * Tres cosas que complican lo que parece un dato simple:
 *
 * 1. **iOS pide permiso, y solo desde un gesto.** `DeviceOrientationEvent.requestPermission()`
 *    tiene que salir de un toque del usuario; llamarlo al cargar la página lo rechaza sin
 *    preguntar nada. Por eso `enable()` se llama desde el botón de la brújula.
 * 2. **Cada plataforma da un ángulo distinto.** Safari da `webkitCompassHeading`, que ya es
 *    grados desde el norte magnético. El resto dan `alpha`, que va al revés (antihorario).
 * 3. **El teléfono girado miente.** Los sensores miden respecto al aparato, no respecto a lo
 *    que se ve; en apaisado hay que restar el giro de la pantalla o el cono apunta 90° torcido.
 *
 * Si no hay sensor (un portátil normalmente no lo tiene), `heading` se queda en `null` y
 * quien lo use no debería pintar nada: mejor sin cono que con uno apuntando al azar.
 */
export function useHeading() {
  const [heading, setHeading] = useState<number | null>(null)
  const [denegado, setDenegado] = useState(false)
  const activo = useRef(false)

  // El sensor tiembla igual que el GPS: sin filtro, el cono vibra sin parar estando quieto.
  const ultimo = useRef<number | null>(null)

  const aplicar = useCallback((grados: number) => {
    const giroPantalla = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0
    const norm = (grados + giroPantalla + 360) % 360
    const prev = ultimo.current
    if (prev !== null) {
      // Diferencia por el camino corto: 359° y 1° están a 2°, no a 358°.
      const delta = Math.abs(((norm - prev + 540) % 360) - 180)
      if (delta < 2) return
    }
    ultimo.current = norm
    setHeading(norm)
  }, [])

  const onOrientation = useCallback(
    (e: DeviceOrientationEvent) => {
      // Safari: ya viene en grados desde el norte y en sentido horario.
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      if (typeof webkit === 'number' && !Number.isNaN(webkit)) {
        aplicar(webkit)
        return
      }
      // Resto: `alpha` gira al contrario. Y solo sirve si es absoluto (referido al norte);
      // el relativo mide desde donde estuviera el móvil al arrancar, que no dice nada.
      if (e.absolute && typeof e.alpha === 'number') aplicar(360 - e.alpha)
    },
    [aplicar],
  )

  const escuchar = useCallback(() => {
    if (activo.current) return
    activo.current = true
    // `deviceorientationabsolute` es el bueno en Android; `deviceorientation` cubre Safari.
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener)
    window.addEventListener('deviceorientation', onOrientation as EventListener)
  }, [onOrientation])

  /** Arranca la brújula. Debe llamarse desde un gesto del usuario (lo exige iOS). */
  const enable = useCallback(async () => {
    type ConPermiso = { requestPermission?: () => Promise<PermissionState> }
    const clase = window.DeviceOrientationEvent as unknown as ConPermiso | undefined
    if (!clase) return
    if (typeof clase.requestPermission === 'function') {
      try {
        const res = await clase.requestPermission()
        if (res !== 'granted') {
          setDenegado(true)
          return
        }
      } catch {
        setDenegado(true)
        return
      }
    }
    escuchar()
  }, [escuchar])

  useEffect(() => {
    // Donde no hace falta permiso (Android, escritorio con sensor) se escucha desde el
    // principio: si no llega ningún evento, `heading` se queda en null y no se pinta nada.
    type ConPermiso = { requestPermission?: () => Promise<PermissionState> }
    const clase = window.DeviceOrientationEvent as unknown as ConPermiso | undefined
    if (clase && typeof clase.requestPermission !== 'function') escuchar()
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener)
      window.removeEventListener('deviceorientation', onOrientation as EventListener)
      activo.current = false
    }
  }, [escuchar, onOrientation])

  return { heading, enable, denegado }
}
