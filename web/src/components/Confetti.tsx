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
export function Confetti({ activo }: { activo: boolean }) {
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
    const colores = ['#3fa9f5', '#7fd3ff', '#f2c14e', '#e8a33d', '#ffffff', '#2b7fc4']
    const piezas = Array.from({ length: 110 }, () => ({
      x: Math.random() * ancho,
      // Escalonadas por encima del borde, o el primer fotograma es una franja sólida de
      // confeti cruzando la pantalla. El escalón es medio alto de pantalla y no uno
      // entero: con más, la última pieza tarda casi un segundo en asomar y la fiesta
      // empieza cuando ya has leído el diálogo.
      y: -20 - Math.random() * alto * 0.45,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vx: -1 + Math.random() * 2,
      vy: 2 + Math.random() * 3.5,
      giro: Math.random() * Math.PI,
      vGiro: -0.15 + Math.random() * 0.3,
      color: colores[Math.floor(Math.random() * colores.length)],
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
        p.vy += 0.045          // gravedad
        p.giro += p.vGiro
        if (p.y < alto + 30) quedan++
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.giro)
        ctx.fillStyle = p.color
        // Escalar el alto por el coseno del giro finge que la pieza es plana y da la
        // vuelta, que es lo que hace que parezca papel y no un cuadrado que rota.
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.giro)))
        ctx.restore()
      }
      if (quedan === 0) return   // todas fuera: se deja de pintar
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)

    return () => { vivo = false; cancelAnimationFrame(raf) }
  }, [activo])

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
