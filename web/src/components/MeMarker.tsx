import { useEffect, useRef } from 'react'
import { Marker } from 'react-leaflet'
import type { Marker as LeafletMarker } from 'leaflet'
import { userLocationIcon } from '../lib/userLocationIcon'
import { anguloDelCono } from '../lib/locateMode'

const meIcon = userLocationIcon()

/**
 * El punto azul del usuario, con el cono que dice hacia dónde mira.
 *
 * El ángulo se escribe directamente en el DOM del marcador en vez de recrear el icono:
 * la brújula dispara varias veces por segundo y rehacer el `divIcon` haría parpadear el
 * punto entero. Leaflet no se entera y el navegador solo recalcula una transformación.
 *
 * Al ángulo de la brújula se le resta el giro del mapa. Si no, con el mapa rotado el
 * cono apuntaría al norte de la pantalla en lugar de al norte real.
 */
export function MeMarker({ pos, heading, bearing, rumboArriba = false }: { pos: [number, number]; heading: number | null; bearing: number; rumboArriba?: boolean }) {
  const ref = useRef<LeafletMarker | null>(null)

  useEffect(() => {
    const el = ref.current?.getElement()
    if (!el) return
    if (heading === null) {
      el.style.setProperty('--me-cone-on', '0')
      return
    }
    el.style.setProperty('--me-cone-on', '1')
    // En rumbo arriba el cono va fijo hacia arriba (0): calcularlo desde el sensor y el
    // giro del mapa —que llegan desfasados— lo hacía saltar. Ver `anguloDelCono`.
    el.style.setProperty('--me-cone', `${anguloDelCono(heading, bearing, rumboArriba)}deg`)
  }, [heading, bearing, pos, rumboArriba])

  return <Marker ref={ref} position={pos} icon={meIcon} zIndexOffset={500} />
}
