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
    // El confeti cae desde arriba; las gotas del easter egg **estallan desde el centro**
    // (donde sale la ventanita con la cifra) y después llueven. Por eso las gotas caen con
    // más gravedad —si no, el estallido tardaría seis segundos en volver al suelo— y son
    // más grandes y muchas más, para que tenga pega.
    const gravedad = forma === 'gotas' ? 0.14 : 0.045
    const cx = ancho / 2
    const cy = alto / 2

    type Pieza = {
      x: number; y: number; w: number; h: number; vx: number; vy: number
      giro: number; vGiro: number; color: string
      // Solo las gotas «adheridas» al cristal: cuentan `espera` fotogramas quietas y luego
      // resbalan (`pegada`), dejando un reguero desde `y0`. `fase` da el bamboleo del agua.
      espera?: number; pegada?: boolean; y0?: number; fase?: number
    }

    const piezas: Pieza[] = forma === 'gotas'
      ? [
          // Estallido: todas parten del centro y salen en todas direcciones, con un
          // pelín de empuje hacia arriba para que dibujen un arco antes de caer.
          ...Array.from({ length: 150 }, () => {
            const ang = Math.random() * Math.PI * 2
            const v = 5 + Math.random() * 12
            return {
              x: cx, y: cy,
              w: 9 + Math.random() * 11, h: 16 + Math.random() * 18,
              vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 2.5,
              giro: 0, vGiro: 0, color: color(),
            }
          }),
          // Lluvia de después: escalonada muy por encima del borde para que siga cayendo
          // cuando el estallido ya ha bajado.
          ...Array.from({ length: 90 }, () => ({
            x: Math.random() * ancho,
            y: -20 - Math.random() * alto * 1.2,
            w: 7 + Math.random() * 9, h: 13 + Math.random() * 15,
            vx: -1 + Math.random() * 2, vy: 2.5 + Math.random() * 3.5,
            giro: 0, vGiro: 0, color: color(),
          })),
          // Adheridas al cristal: aparecen quietas repartidas por la pantalla (como
          // salpicaduras del estallido), aguantan ~1 s y luego resbalan hacia abajo
          // dejando un reguero. `espera` en fotogramas (~0,6–1,4 s a 60 fps).
          ...Array.from({ length: 28 }, () => {
            const y = alto * (0.15 + Math.random() * 0.5)
            return {
              x: ancho * (0.1 + Math.random() * 0.8), y,
              w: 10 + Math.random() * 9, h: 13 + Math.random() * 12,
              vx: 0, vy: 0, giro: 0, vGiro: 0, color: color(),
              espera: 36 + Math.floor(Math.random() * 48),
              pegada: true, y0: y, fase: Math.random() * Math.PI * 2,
            }
          }),
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
    let frame = 0
    function paso() {
      if (!vivo || !ctx) return
      frame++
      ctx.clearRect(0, 0, ancho, alto)
      let quedan = 0
      for (const p of piezas) {
        if (p.espera && p.espera > 0) {
          // Pegada al cristal, quieta, mientras aguanta la tensión superficial.
          p.espera--
          quedan++
        } else if (p.pegada) {
          // Ya se soltó: resbala hacia abajo —más despacio que caer, por el roce con el
          // cristal (`gravedad * 0.55`)— con un leve bamboleo, como el agua real.
          p.x += Math.sin(frame * 0.12 + (p.fase ?? 0)) * 0.4
          p.y += p.vy
          p.vy += gravedad * 0.55
          if (p.y < alto + 30) quedan++
        } else {
          p.x += p.vx
          p.y += p.vy
          p.vy += gravedad
          p.giro += p.vGiro
          if (p.y < alto + 30) quedan++
        }
        // Reguero de la gota que resbala: una línea tenue desde donde estaba pegada
        // hasta donde va, acotada a ~46 px para que sea una estela y no un rayón.
        if (p.pegada && (!p.espera || p.espera <= 0) && p.y0 != null && p.y > p.y0 + 2) {
          ctx.save()
          ctx.strokeStyle = p.color
          ctx.globalAlpha = 0.2
          ctx.lineWidth = Math.max(1.5, p.w * 0.3)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.x, Math.max(p.y0, p.y - 46))
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ctx.restore()
        }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.fillStyle = p.color
        if (forma === 'gotas') {
          // Una gota: cae recta (sin giro), punta arriba y panza abajo con dos curvas.
          const r = p.w / 2
          ctx.beginPath()
          ctx.moveTo(0, -p.h / 2)
          ctx.quadraticCurveTo(r, 0, 0, p.h / 2)
          ctx.quadraticCurveTo(-r, 0, 0, -p.h / 2)
          ctx.fill()
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
