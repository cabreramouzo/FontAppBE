import { useEffect, useRef } from 'react'
import { Marker, useMap } from 'react-leaflet'
import L, { type Marker as LeafletMarker } from 'leaflet'
import { userLocationIcon } from '../lib/userLocationIcon'
import { anguloDelCono } from '../lib/locateMode'

const meIcon = userLocationIcon(false)
const meIconStale = userLocationIcon(true)

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
export function MeMarker({ pos, heading, bearing, rumboArriba = false, atenuado = false }: { pos: [number, number]; heading: number | null; bearing: number; rumboArriba?: boolean; atenuado?: boolean }) {
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

  // Atenuado (última posición conocida) va por debajo del punto en vivo y no molesta.
  return <Marker ref={ref} position={pos} icon={atenuado ? meIconStale : meIcon} zIndexOffset={atenuado ? 400 : 500} />
}

/**
 * Marcador de navegación: la flecha que **fluye entre refrescos del GPS**.
 *
 * El punto normal salta a cada fix, y eso yendo rápido se ve a trompicones. Aquí, en vez
 * de colocar el marcador en la última posición y ya, se **interpola** desde donde estaba
 * hasta el nuevo fix a lo largo del intervalo entre fixes, fotograma a fotograma. No pide
 * más GPS —el mismo dato, repartido en el tiempo— y con `follow` arrastra el mapa con la
 * misma posición suavizada, así el mundo se desliza en vez de dar tirones.
 *
 * Es un `L.marker` imperativo y no un `<Marker>` de react-leaflet a propósito: react
 * recoloca el marcador cada vez que cambia la prop `position`, que es justo el salto que
 * hay que evitar. Aquí el `position` lo mandamos nosotros por `setLatLng` en cada frame.
 */
export function MeMarkerNav({ target, curso, bearing, rumboArriba = false, intervaloMs, follow }: {
  target: [number, number]
  curso: number | null
  bearing: number
  rumboArriba?: boolean
  intervaloMs: number
  follow: boolean
}) {
  const map = useMap()
  // Lo que cambia cada frame vive en refs: el bucle de animación no debe repintar React.
  const mostrada = useRef(L.latLng(target[0], target[1]))
  const desde = useRef(mostrada.current)
  const hacia = useRef(mostrada.current)
  const t0 = useRef(0)
  const dur = useRef(1000)
  const cursoRef = useRef(curso)
  const bearingRef = useRef(bearing)
  const rumboRef = useRef(rumboArriba)
  const followRef = useRef(follow)

  useEffect(() => { cursoRef.current = curso; bearingRef.current = bearing; rumboRef.current = rumboArriba; followRef.current = follow })

  // Nuevo fix: se interpola desde donde se está mostrando ahora hasta el nuevo objetivo,
  // durante el intervalo real entre fixes (acotado para que ni se arrastre ni tiemble).
  useEffect(() => {
    desde.current = mostrada.current
    hacia.current = L.latLng(target[0], target[1])
    t0.current = performance.now()
    dur.current = Math.min(3000, Math.max(400, intervaloMs || 1000))
  }, [target, intervaloMs])

  useEffect(() => {
    const marker = L.marker(mostrada.current, {
      icon: userLocationIcon(false, true), interactive: false, keyboard: false, zIndexOffset: 600,
    }).addTo(map)
    let raf = 0
    const tick = () => {
      const p = dur.current > 0 ? Math.min(1, (performance.now() - t0.current) / dur.current) : 1
      const a = desde.current, b = hacia.current
      mostrada.current = L.latLng(a.lat + (b.lat - a.lat) * p, a.lng + (b.lng - a.lng) * p)
      marker.setLatLng(mostrada.current)
      const el = marker.getElement()
      if (el) el.style.setProperty('--me-nav', `${anguloDelCono(cursoRef.current ?? 0, bearingRef.current, rumboRef.current)}deg`)
      // El seguimiento va con la MISMA posición suavizada y sin animación de Leaflet:
      // 60 fps de `panTo` instantáneo YA es el suavizado, y la animación propia de Leaflet
      // se pisaría con la nuestra dando el tirón que veníamos a quitar.
      if (followRef.current) map.panTo(mostrada.current, { animate: false })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); marker.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  return null
}
