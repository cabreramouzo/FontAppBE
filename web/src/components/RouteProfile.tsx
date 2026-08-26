import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'
import type { PuntoPerfil } from '../lib/gpxImport'

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
export function RouteProfile({ puntos, fuentesKm, largoKm }: {
  puntos: PuntoPerfil[]
  /** En qué kilómetro cae cada fuente. */
  fuentesKm: number[]
  largoKm: number
}) {
  const { t } = useI18n()
  const tema = useTheme()
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
      <Box sx={{ position: 'relative' }}>
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
        {/* Las líneas verticales sí van dentro: estirar una vertical no la deforma. */}
        {fuentesKm.map((km, i) => (
          <line key={`l${km}-${i}`} x1={x(km)} y1={y(alturaEn(puntos, km))} x2={x(km)} y2={H}
                stroke={tema.palette.primary.main} strokeWidth={1} opacity={0.35}
                vectorEffect="non-scaling-stroke" />
        ))}
      </Box>
      {/* Las fuentes van FUERA del SVG. Con `preserveAspectRatio="none"` el lienzo se
          estira en horizontal y un `<circle>` saldría ovalado; un elemento posicionado en
          porcentaje se queda redondo sea cual sea el ancho de la pantalla. */}
      {fuentesKm.map((km, i) => (
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
