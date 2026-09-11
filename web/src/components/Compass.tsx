import { useRef } from 'react'
import Fab from '@mui/material/Fab'
import Box from '@mui/material/Box'
import Zoom from '@mui/material/Zoom'
import { useI18n } from '../i18n/I18nContext'
import { anguloPuntero, bearingArrastrando, esArrastre } from '../lib/compassDrag'

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
        {/* La aguja gira al revés que el mapa: si el mapa mira al este, el norte
            queda a la izquierda. La N acompaña a la punta roja. */}
        <Box
          component="svg"
          viewBox="0 0 24 24"
          sx={{ width: 26, height: 26, transform: `rotate(${-bearing}deg)`, transition: 'transform 0.1s linear' }}
        >
          <path d="M12 3 L15.4 12 L12 10.4 L8.6 12 Z" fill="#e5484d" />
          <path d="M12 21 L8.6 12 L12 13.6 L15.4 12 Z" fill="currentColor" opacity="0.45" />
        </Box>
      </Fab>
    </Zoom>
  )
}
