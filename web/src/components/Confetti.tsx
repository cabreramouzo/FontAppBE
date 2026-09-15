import { useEffect, useRef } from 'react'

/**
 * Confeti en un `<canvas>`, sin dependencias.
 *
 * Una librería de confeti son 10–15 KB para dos segundos de fiesta, y este proyecto no
 * añade dependencias sin justificarlas. Son cien rectángulos con gravedad y giro; el
 * efecto está en la física de andar por casa, no en la biblioteca.
 *
 * Se para solo cuando las piezas salen por abajo, y **no se pinta con
 * `prefers-reduced-motion`**: un chaparrón de partículas es exactamente lo que esa
 * preferencia pide que no ocurra. El diálogo que lo acompaña sigue apareciendo entero,
 * así que quien la tiene puesta se entera igual de lo que ha ganado.
 */
export function Confetti({ activo, forma = 'confeti' }: { activo: boolean; forma?: 'confeti' | 'gotas' }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!activo) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // El canvas se dibuja en píxeles físicos: en una pantalla retina, sin esto, el
    // confeti sale borroso y del doble de tamaño.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const ancho = canvas.clientWidth
    const alto = canvas.clientHeight
    canvas.width = ancho * dpr
    canvas.height = alto * dpr
    ctx.scale(dpr, dpr)

    // Azules y dorados: el agua de la aplicación y el metal de las medallas. Un arcoíris
    // genérico no tendría nada que ver con lo que se está celebrando.
    // En modo `gotas` (el easter egg del logo) solo agua, sin el dorado de las medallas.
    const colores = forma === 'gotas'
      ? ['#3fa9f5', '#7fd3ff', '#2b7fc4', '#5bc0eb', '#a8e0ff']
      : ['#3fa9f5', '#7fd3ff', '#f2c14e', '#e8a33d', '#ffffff', '#2b7fc4']
    const color = () => colores[Math.floor(Math.random() * colores.length)]
    // El confeti cae desde arriba; las gotas del easter egg estallan desde el centro y
    // después llueven. No hacen falta miles: además de tapar el mapa, rasterizar tantos
    // emoji por fotograma castigaba especialmente a Safari en un iPhone.
    const gravedad = forma === 'gotas' ? 0.18 : 0.045
    const cx = ancho / 2
    const cy = alto / 2

    type Pieza = {
      x: number; y: number; w: number; h: number; vx: number; vy: number
      giro: number; vGiro: number; color: string; alpha?: number
    }

    const piezas: Pieza[] = forma === 'gotas'
      ? [
          // Estallido: todas parten del centro y salen en todas direcciones, con un
          // pelín de empuje hacia arriba para que dibujen un arco antes de caer.
          ...Array.from({ length: 90 }, () => {
            const ang = Math.random() * Math.PI * 2
            const v = 5.5 + Math.random() * 9.5
            return {
              x: cx, y: cy,
              w: 14 + Math.random() * 16, h: 14 + Math.random() * 16,
              vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 2,
              giro: 0, vGiro: 0, color: color(), alpha: 0.72 + Math.random() * 0.28,
            }
          }),
          // Lluvia de después: escalonada muy por encima del borde para que siga cayendo
          // cuando el estallido ya ha bajado.
          ...Array.from({ length: 130 }, () => ({
            x: Math.random() * ancho,
            y: -30 - Math.random() * alto * 0.85,
            w: 12 + Math.random() * 15, h: 12 + Math.random() * 15,
            vx: -0.7 + Math.random() * 1.4, vy: 3.5 + Math.random() * 3,
            giro: 0, vGiro: 0, color: color(), alpha: 0.58 + Math.random() * 0.38,
          })),
        ]
      : Array.from({ length: 110 }, () => ({
          x: Math.random() * ancho,
          // Escalonadas por encima del borde, o el primer fotograma es una franja sólida
          // de confeti cruzando la pantalla. El escalón es medio alto de pantalla y no uno
          // entero: con más, la última pieza tarda casi un segundo en asomar y la fiesta
          // empieza cuando ya has leído el diálogo.
          y: -20 - Math.random() * alto * 0.45,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          vx: -1 + Math.random() * 2,
          vy: 2 + Math.random() * 3.5,
          giro: Math.random() * Math.PI,
          vGiro: -0.15 + Math.random() * 0.3,
          color: color(),
        }))

    let raf = 0
    let vivo = true
    function paso() {
      if (!vivo || !ctx) return
      ctx.clearRect(0, 0, ancho, alto)
      let quedan = 0
      for (const p of piezas) {
        p.x += p.vx
        p.y += p.vy
        p.vy += gravedad
        p.giro += p.vGiro
        if (p.y < alto + 40) quedan++
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.fillStyle = p.color
        if (forma === 'gotas') {
          // El emoji conserva el lenguaje visual que ya usa FontApp. Su punta se orienta
          // en la dirección contraria al movimiento: gira al salir del estallido y la
          // gravedad lo endereza poco a poco mientras cae, sin dar vueltas artificiales.
          const orientacion = Math.atan2(p.vy, p.vx) - Math.PI / 2
          ctx.rotate(orientacion)
          ctx.globalAlpha = p.alpha ?? 1
          ctx.font = `${p.w}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.shadowColor = 'rgba(18, 111, 170, 0.22)'
          ctx.shadowBlur = Math.max(2, p.w * 0.18)
          ctx.fillText('💧', 0, 0)
        } else {
          ctx.rotate(p.giro)
          // Escalar el alto por el coseno del giro finge que la pieza es plana y da la
          // vuelta, que es lo que hace que parezca papel y no un cuadrado que rota.
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.giro)))
        }
        ctx.restore()
      }
      if (quedan === 0) return   // todas fuera: se deja de pintar
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)

    return () => { vivo = false; cancelAnimationFrame(raf) }
  }, [activo, forma])

  if (!activo) return null
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        // Por encima del diálogo y sin comerse los clics: el confeti cae DELANTE de la
        // medalla, y tocar el botón de cerrar tiene que seguir funcionando.
        pointerEvents: 'none', zIndex: 2000,
      }}
    />
  )
}
