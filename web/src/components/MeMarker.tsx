import { useEffect, useRef } from 'react'
import { Marker } from 'react-leaflet'
import type { Marker as LeafletMarker } from 'leaflet'
import { userLocationIcon } from '../lib/userLocationIcon'

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
export function MeMarker({ pos, heading, bearing }: { pos: [number, number]; heading: number | null; bearing: number }) {
  const ref = useRef<LeafletMarker | null>(null)

  useEffect(() => {
    const el = ref.current?.getElement()
    if (!el) return
    if (heading === null) {
      el.style.setProperty('--me-cone-on', '0')
      return
    }
    el.style.setProperty('--me-cone-on', '1')
    el.style.setProperty('--me-cone', `${heading - bearing}deg`)
  }, [heading, bearing, pos])

  return <Marker ref={ref} position={pos} icon={meIcon} zIndexOffset={500} />
}
