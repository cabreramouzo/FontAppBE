import { useRef } from 'react'
import Fab from '@mui/material/Fab'
import Box from '@mui/material/Box'
import Zoom from '@mui/material/Zoom'
import { useI18n } from '../i18n/I18nContext'
import { anguloPuntero, bearingArrastrando, esArrastre, cardinalArriba } from '../lib/compassDrag'

/**
 * Brújula: devuelve el mapa al norte y, arrastrándola, lo gira.
 *
 * En móvil aparece solo cuando el mapa está girado —hay gesto de dos dedos para girar, así
 * que un botón fijo sobra— y un toque endereza el norte. En **escritorio no hay gesto de
 * dos dedos**, así que sin esto no había forma de girar el mapa: por eso ahí se enseña
 * SIEMPRE (`siempre`) y se puede **arrastrar como un mando**, igual que Mapas del Mac. Un
 * clic sigue enderezando; un arrastre gira. La geometría vive en `lib/compassDrag`.
 *
 * En iOS hace además doble trabajo: al tocarla pide permiso para el sensor de orientación,
 * que Safari solo concede desde un gesto del usuario.
 */
export function Compass({ bearing, onReset, onRotate, siempre = false }: {
  bearing: number
  onReset: () => void
  onRotate?: (deg: number) => void
  siempre?: boolean
}) {
  const { t } = useI18n()
  const girado = Math.abs(bearing) > 0.5
  // Qué cardinal queda arriba, escrito como en Mapas del Mac. La letra la traduce el
  // diccionario (O y no W en las lenguas romances).
  const letra = t(`compass.${cardinalArriba(bearing).toLowerCase()}`)
  const ref = useRef<HTMLButtonElement>(null)
  // Estado del arrastre en curso: dónde está el centro de la brújula, dónde se agarró y con
  // qué bearing, y si ya se ha movido lo bastante para contar como giro (y no como clic).
  const arrastre = useRef<
    { cx: number; cy: number; x0: number; y0: number; ang0: number; bearing0: number; movido: boolean } | null
  >(null)

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!onRotate) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    arrastre.current = {
      cx, cy, x0: e.clientX, y0: e.clientY,
      ang0: anguloPuntero(cx, cy, e.clientX, e.clientY),
      bearing0: bearing, movido: false,
    }
    // Captura el puntero para seguir recibiendo move/up aunque salga del botón, y para que
    // el mapa de debajo no empiece a arrastrarse a la vez.
    el.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const a = arrastre.current
    if (!a) return
    if (!a.movido && !esArrastre(e.clientX - a.x0, e.clientY - a.y0)) return
    a.movido = true
    const ang = anguloPuntero(a.cx, a.cy, e.clientX, e.clientY)
    onRotate?.(bearingArrastrando(a.bearing0, a.ang0, ang))
    e.stopPropagation()
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const a = arrastre.current
    arrastre.current = null
    ref.current?.releasePointerCapture?.(e.pointerId)
    // Sin arrastre fue un clic: enderezar el norte (y pedir el sensor en iOS).
    if (a && !a.movido) onReset()
  }

  return (
    <Zoom in={siempre || girado} unmountOnExit>
      <Fab
        ref={ref}
        size="medium"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={t('map.northUp')}
        title={t('map.northUp')}
        sx={{
          bgcolor: 'background.paper', color: 'text.primary',
          '&:hover': { bgcolor: 'background.paper' },
          // Un mando que se agarra, y sin que el táctil lo confunda con un scroll.
          cursor: onRotate ? 'grab' : 'pointer',
          touchAction: 'none',
        }}
      >
        {/* Rosa de los vientos: la punta roja (norte) gira para apuntar al norte REAL, y en
            el centro va la letra del cardinal que queda ARRIBA. El giro es `+bearing`, el
            mismo signo que `cardinalArriba`; con `-bearing` la aguja y la letra se
            contradecían. La letra va FUERA del grupo que gira, para no ponerse del revés. */}
        <Box component="svg" viewBox="0 0 40 40" sx={{ width: 34, height: 34, color: 'text.secondary' }}>
          {/* Giro por ATRIBUTO SVG y no por CSS: `transform` CSS sobre un `<g>` con
              `transform-box: fill-box` computa a identidad en algunos navegadores (medido).
              El atributo `rotate(deg cx cy)` gira siempre, alrededor de (20,20). */}
          <g transform={`rotate(${bearing} 20 20)`}>
            <path d="M20 5 L23.2 12.5 L20 10.7 L16.8 12.5 Z" fill="#e5484d" />
            <circle cx="20" cy="35" r="1.4" fill="currentColor" opacity="0.35" />
            <circle cx="35" cy="20" r="1.4" fill="currentColor" opacity="0.35" />
            <circle cx="5" cy="20" r="1.4" fill="currentColor" opacity="0.35" />
          </g>
          <text x="20" y="20" textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: '13px', fontWeight: 700, fill: 'currentColor' }}>
            {letra}
          </text>
        </Box>
      </Fab>
    </Zoom>
  )
}
