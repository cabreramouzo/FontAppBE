import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import ExploreIcon from '@mui/icons-material/ExploreOutlined'
import CheckIcon from '@mui/icons-material/CheckCircleOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import { alpha } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'
import { useHeading } from '../lib/useHeading'
import { haversineKm } from '../lib/geo'
import { guia, rumbo, RADIO_GUIA_M, type Guia } from '../lib/approach'

/**
 * «Los últimos metros»: una flecha a la fuente cuando ya estás cerca.
 *
 * Nace de una queja concreta de un ciclista de montaña: «paso por un pueblo y no sé dónde
 * está la fuente», «sé que en ese parque hay una y no la encuentro». El mapa no falla —el
 * punto está bien— y las indicaciones tampoco: te llevan a una calle, y la fuente está
 * dentro del parque, donde no hay calle a la que llevarte. El hueco está en los últimos
 * doscientos metros.
 *
 * ## Cuándo aparece, y por qué no siempre
 *
 * Solo por debajo de {@link RADIO_GUIA_M}. Más lejos no ayudaría: una flecha en línea recta
 * a dos kilómetros te manda contra un río. Y una tarjeta permanente que casi nunca sirve se
 * convierte en decorado que se deja de ver, así que al fondo de la ficha —donde ya no
 * estorba— no vale la pena tenerla.
 *
 * ## El permiso, con la regla de siempre
 *
 * No se pide nada al cargar. Si el navegador ya tenía concedida la ubicación, se sigue en
 * vivo; si no, hay un botón, porque **pedir permiso sin que nadie lo haya pedido acaba en
 * un «denegar» que se queda para siempre** (es la misma regla que sigue el mapa al abrirse).
 * La brújula de iOS además exige que la petición salga de un gesto, y ese botón lo es.
 *
 * ## Lo que NO hace
 *
 * No dibuja flecha sin brújula fiable, ni cuando el margen del GPS se come la distancia
 * — la decisión vive en `lib/approach.ts`, con sus tests. Ahí es donde la foto y la
 * descripción de la ficha hacen el trabajo que el sensor ya no puede.
 */
export function FinalApproach({ lat, long, tieneFoto }: { lat: number; long: number; tieneFoto: boolean }) {
  const { t } = useI18n()
  const { heading, enable } = useHeading()
  const [pos, setPos] = useState<GeolocationPosition | null>(null)
  const [siguiendo, setSiguiendo] = useState(false)
  const watch = useRef<number | null>(null)

  // Si el permiso ya estaba dado, se sigue en vivo sin preguntar nada.
  useEffect(() => {
    let vivo = true
    if (!navigator.geolocation || !window.isSecureContext) return
    navigator.permissions?.query({ name: 'geolocation' })
      .then((p) => { if (vivo && p.state === 'granted') setSiguiendo(true) })
      .catch(() => { /* Safari viejo sin Permissions API: se queda el botón */ })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!siguiendo || !navigator.geolocation) return
    watch.current = navigator.geolocation.watchPosition(
      setPos,
      () => setSiguiendo(false),
      // Alta precisión **aquí sí**: es lo único de la app que guía a alguien andando, y a
      // treinta metros la diferencia entre ±10 y ±40 es encontrarla o dar vueltas.
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )
    return () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
      watch.current = null
    }
  }, [siguiendo])

  const distanciaM = pos ? haversineKm(pos.coords.latitude, pos.coords.longitude, lat, long) * 1000 : Infinity
  const estado: Guia = pos
    ? guia(distanciaM, pos.coords.accuracy ?? null, heading,
           rumbo(pos.coords.latitude, pos.coords.longitude, lat, long))
    : { fase: 'lejos' }

  // Sin permiso no se sabe si estás cerca, así que tampoco se puede ofrecer guiarte sin
  // más: el botón saldría en las 74.000 fichas, y en 73.999 no serviría de nada. Solo se
  // ofrece a quien ya está siguiendo y se ha acercado.
  if (!siguiendo && !pos) return null
  if (estado.fase === 'lejos') return null

  const metros = Math.round(distanciaM)
  // Al llegar, la tarjeta entera se pone verde, como hace FindMy. Es lo que convierte un
  // dato que hay que leer en una señal que se ve con el móvil en la mano y sin gafas.
  //
  // Aquí el verde **no lleva el significado él solo** —el texto ya cambia a «Ya estás» y
  // la flecha desaparece—, así que es refuerzo y no información. Es justo la distinción
  // que hizo descartar el verde/rojo en guardar y descartar: allí el color era lo único
  // que separaba dos acciones, y eso se cae con daltonismo.
  const hasLlegado = estado.fase === 'llegando'

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2, borderRadius: 3, mb: 2, display: 'flex', alignItems: 'center', gap: 2,
        ...(hasLlegado && {
          borderColor: 'success.main',
          bgcolor: (th) => alpha(th.palette.success.main, th.palette.mode === 'dark' ? 0.18 : 0.10),
        }),
      }}
    >
      {estado.fase === 'guiando' && estado.giro !== null ? (
        <Box
          component="svg"
          viewBox="0 0 48 48"
          aria-hidden
          sx={{
            width: 56, height: 56, flexShrink: 0, color: 'primary.main',
            transform: `rotate(${estado.giro}deg)`,
            // Suave, pero no tanto como para ir por detrás de la realidad al girarte.
            transition: 'transform 0.2s linear',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          <circle cx="24" cy="24" r="23" fill="currentColor" opacity="0.10" />
          <path d="M24 7 L34 34 L24 28 L14 34 Z" fill="currentColor" />
        </Box>
      ) : (
        // Solo al llegar es una marca de verificación. Sin brújula y a 80 m sería mentira:
        // ahí no se ha llegado a nada, simplemente no se puede apuntar.
        hasLlegado
          ? <CheckIcon sx={{ fontSize: 44, color: 'success.main', flexShrink: 0 }} />
          : <PlaceIcon sx={{ fontSize: 44, color: 'primary.main', flexShrink: 0 }} />
      )}

      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2, color: hasLlegado ? 'success.main' : undefined }}>
          {estado.fase === 'llegando' ? t('approach.here') : t('approach.away', { m: String(metros) })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {estado.fase === 'llegando'
            ? t(tieneFoto ? 'approach.hereWithPhoto' : 'approach.hereNoPhoto')
            : estado.giro === null
              ? t('approach.noCompass')
              : t('approach.follow')}
        </Typography>
        {estado.fase === 'guiando' && estado.giro === null && (
          // iOS solo concede el sensor si la petición sale de un gesto; éste lo es.
          <Button size="small" startIcon={<ExploreIcon />} onClick={() => void enable()} sx={{ mt: 0.5, ml: -0.5 }}>
            {t('approach.enableCompass')}
          </Button>
        )}
      </Box>
    </Paper>
  )
}
