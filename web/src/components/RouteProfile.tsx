import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'
import { puntoEnKm, type PuntoPerfil } from '../lib/gpxImport'
import { señala } from '../lib/routeScrub'

/**
 * El perfil del recorrido con las fuentes marcadas encima.
 *
 * ## Por qué esto y no un mapa
 *
 * Un ciclista lee un perfil de forma nativa, y aquí contesta de un vistazo la pregunta que
 * de verdad se trae: **dónde está el trecho largo sin agua**. En un mapa eso se esconde —
 * una ruta con lazos es un garabato, y dos fuentes pegadas en el plano pueden estar a 20 km
 * la una de la otra sobre el recorrido, que es la distancia que se pedalea.
 *
 * Además pesa lo que un `<svg>`: meter Leaflet en esta página multiplicaría por treinta su
 * tamaño (9 KB hoy) para contestar peor.
 *
 * ## Solo se pinta si el fichero trae altitudes
 *
 * Sin `<ele>` no se dibuja una línea plana: llano y desconocido no son lo mismo, y una
 * recta diría «esto no tiene desnivel» sobre un puerto de montaña. `perfil()` devuelve
 * vacío y aquí no se pinta nada.
 */
/** Una fuente sobre el perfil. */
export interface FuenteEnPerfil {
  kmRuta: number
  nombre: string
}

/**
 * Cuánto de la ruta cuenta como «estás sobre esa fuente», en tanto por uno.
 *
 * Es un porcentaje del largo y no una distancia fija porque el perfil siempre ocupa el
 * mismo ancho en pantalla: en una ruta de 100 km, 500 m son dos píxeles y no se podría
 * apuntar a ninguna; en una de 5 km, un margen de 500 m taparía media ruta. El 1,5 % son
 * unos diez píxeles de perfil, que es lo que abarca un dedo.
 */
const CERCA = 0.015

export function RouteProfile({ puntos, fuentes, largoKm }: {
  puntos: PuntoPerfil[]
  fuentes: FuenteEnPerfil[]
  largoKm: number
}) {
  const { t } = useI18n()
  const tema = useTheme()
  const caja = useRef<HTMLDivElement>(null)
  /** Kilómetro señalado con el dedo o el cursor, o `null` si no se está señalando nada. */
  const [señalado, setSeñalado] = useState<number | null>(null)

  function sigue(e: React.PointerEvent) {
    const r = caja.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    // Se acota al ancho: al arrastrar rápido el dedo se sale de la caja y sin esto la
    // bolita se iría fuera del perfil.
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width)
    setSeñalado((x / r.width) * largoKm)
  }

  /**
   * **El índice** de la fuente que el dedo está señalando, o `-1`.
   *
   * Índice y no el objeto ni su kilómetro: dos fuentes pueden caer en el mismo punto del
   * recorrido —en la ruta de prueba hay dos en el km 1,7 y dos en el 2,0— y comparando por
   * kilómetro se agrandarían las dos a la vez, que es justo lo contrario de lo que esto
   * viene a hacer: decir **cuál** de ellas estás mirando.
   */
  const iCerca = (() => {
    if (señalado === null || fuentes.length === 0) return -1
    let mejor = 0
    for (let i = 1; i < fuentes.length; i += 1) {
      if (Math.abs(fuentes[i].kmRuta - señalado) < Math.abs(fuentes[mejor].kmRuta - señalado)) mejor = i
    }
    return Math.abs(fuentes[mejor].kmRuta - señalado) <= CERCA * largoKm ? mejor : -1
  })()
  const fuenteCerca = iCerca >= 0 ? fuentes[iCerca] : null

  /**
   * Se le dice al mapa dónde está el dedo, para que ponga su punto en el mismo sitio.
   *
   * Se publica el kilómetro de **la marca** y no el del dedo: sobre una fuente la marca se
   * imanta a ella, y si el mapa siguiera al dedo las dos marcas del mismo sitio estarían
   * en puntos distintos, que es peor que no tener la segunda.
   *
   * Va en un efecto y no dentro de `sigue`: `fuenteCerca` se calcula durante el render, y
   * avisar desde el manejador publicaría el imantado del movimiento **anterior** — el
   * mismo render de retraso que ya obligó a rehacer la marca del perfil.
   */
  const kmPublicado = señalado === null ? null : (fuenteCerca ? fuenteCerca.kmRuta : señalado)
  useEffect(() => {
    señala(kmPublicado)
    // Al desmontar se limpia, o el mapa se quedaría con un punto de una ruta que ya no está.
    return () => señala(null)
  }, [kmPublicado])

  if (puntos.length < 2 || largoKm <= 0) return null

  const W = 1000
  const H = 140
  const minEle = Math.min(...puntos.map((p) => p.ele))
  const maxEle = Math.max(...puntos.map((p) => p.ele))
  // Un margen mínimo para que una ruta casi llana no salga como una sierra: sin esto, 4 m
  // de desnivel se estiran a los 140 px de alto y parecen un puerto.
  const rango = Math.max(maxEle - minEle, 50)
  const x = (km: number) => (km / largoKm) * W
  const y = (ele: number) => H - ((ele - minEle) / rango) * (H - 12) - 6

  const linea = puntos.map((p) => `${x(p.km).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ')

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {t('gpxIn.profile', { min: String(Math.round(minEle)), max: String(Math.round(maxEle)) })}
      </Typography>
      {/* `relative` para colgar de aquí las gotas de las fuentes. */}
      <Box
        ref={caja}
        onPointerMove={sigue}
        onPointerDown={sigue}
        onPointerLeave={() => setSeñalado(null)}
        onPointerCancel={() => setSeñalado(null)}
        sx={{
          position: 'relative',
          // `pan-y` y no `none`: con `none` el perfil se tragaría el desplazamiento
          // vertical de la página y la pantalla se quedaría enganchada en esta franja.
          // Así el dedo hacia los lados recorre el perfil y hacia arriba sigue moviendo
          // la página, que es lo que espera cualquiera.
          touchAction: 'pan-y',
          cursor: 'crosshair',
        }}
      >
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('gpxIn.profile', { min: String(Math.round(minEle)), max: String(Math.round(maxEle)) })}
        sx={{ width: '100%', height: 120, display: 'block' }}
      >
        <polygon
          points={`0,${H} ${linea} ${W},${H}`}
          fill={tema.palette.primary.main}
          opacity={tema.palette.mode === 'dark' ? 0.22 : 0.14}
        />
        <polyline points={linea} fill="none" stroke={tema.palette.primary.main} strokeWidth={2}
                  vectorEffect="non-scaling-stroke" />
        {señalado !== null && (
          <line x1={x(fuenteCerca ? fuenteCerca.kmRuta : señalado)} y1={0}
                x2={x(fuenteCerca ? fuenteCerca.kmRuta : señalado)} y2={H}
                stroke={tema.palette.text.primary} strokeWidth={1} opacity={0.45}
                vectorEffect="non-scaling-stroke" />
        )}
        {/* Las líneas verticales sí van dentro: estirar una vertical no la deforma. */}
        {fuentes.map(({ kmRuta: km }, i) => (
          <line key={`l${km}-${i}`} x1={x(km)} y1={y(alturaEn(puntos, km))} x2={x(km)} y2={H}
                stroke={tema.palette.primary.main} strokeWidth={1} opacity={0.35}
                vectorEffect="non-scaling-stroke" />
        ))}
      </Box>
      {/* Las fuentes van FUERA del SVG. Con `preserveAspectRatio="none"` el lienzo se
          estira en horizontal y un `<circle>` saldría ovalado; un elemento posicionado en
          porcentaje se queda redondo sea cual sea el ancho de la pantalla. */}
      {fuentes.map(({ kmRuta: km }, i) => (
        <Box
          key={`p${km}-${i}`}
          sx={{
            position: 'absolute',
            left: `${(km / largoKm) * 100}%`,
            top: `${(y(alturaEn(puntos, km)) / H) * 120}px`,
            width: 9, height: 9, mt: '-4.5px', ml: '-4.5px',
            borderRadius: '50%',
            bgcolor: 'primary.main',
            border: 2, borderColor: 'background.paper',
            boxSizing: 'content-box',
          }}
        />
      ))}
      {señalado !== null && (() => {
        const p = puntoEnKm(puntos, señalado)
        if (!p) return null
        // Sobre una fuente, la marca **se pega a ella** y crece; si no, sigue al dedo.
        //
        // Esto sustituye a agrandar la gota de la fuente, que es lo primero que probé y se
        // pintaba **con un render de retraso**: movías el dedo, el nombre acertaba y la
        // gota que crecía era la de la posición anterior; con un segundo movimiento de
        // medio píxel se ponía al día. Con una sola marca el problema desaparece de raíz
        // —hay un elemento y siempre refleja el estado actual— y además queda mejor: se
        // engancha a la fuente en vez de quedarse al lado.
        const enFuente = fuenteCerca !== null
        const kmMarca = enFuente ? fuenteCerca.kmRuta : p.km
        const altMarca = enFuente ? alturaEn(puntos, fuenteCerca.kmRuta) : p.ele
        const izq = (kmMarca / largoKm) * 100
        return (
          <>
            <Box sx={{
              position: 'absolute', left: `${izq}%`, top: `${(y(altMarca) / H) * 120}px`,
              ...(enFuente
                ? { width: 15, height: 15, mt: '-7.5px', ml: '-7.5px', bgcolor: 'primary.main' }
                : { width: 11, height: 11, mt: '-5.5px', ml: '-5.5px', bgcolor: 'text.primary' }),
              borderRadius: '50%',
              border: 2, borderColor: 'background.paper',
              boxSizing: 'content-box', pointerEvents: 'none',
            }} />
            {/* La etiqueta se pega al borde en vez de salirse: en el km 0 y en el último
                se iría fuera de la caja y quedaría cortada. */}
            <Box sx={{
              position: 'absolute', top: -4, left: `${izq}%`,
              transform: `translateX(${izq < 15 ? '0%' : izq > 85 ? '-100%' : '-50%'})`,
              px: 0.75, py: 0.25, borderRadius: 1, whiteSpace: 'nowrap',
              bgcolor: 'text.primary', color: 'background.paper',
              fontSize: 12, fontWeight: 700, pointerEvents: 'none',
            }}>
              {/* El nombre sustituye a la altitud cuando estás sobre una fuente: es lo
                  que se ha venido a mirar, y meter las tres cosas hace una etiqueta que no
                  cabe en un móvil. El kilómetro se queda porque es lo que ordena la lista
                  de abajo y permite encontrarla allí. */}
              {fuenteCerca
                ? t('gpxIn.atFont', { km: fuenteCerca.kmRuta.toFixed(1), name: fuenteCerca.nombre })
                : t('gpxIn.atKm', { km: p.km.toFixed(1), m: String(Math.round(p.ele)) })}
            </Box>
          </>
        )
      })()}
      </Box>
    </Box>
  )
}

/** La altura del recorrido en ese kilómetro, buscando el punto más cercano. */
function alturaEn(puntos: PuntoPerfil[], km: number): number {
  let mejor = puntos[0]
  for (const p of puntos) if (Math.abs(p.km - km) < Math.abs(mejor.km - km)) mejor = p
  return mejor.ele
}
