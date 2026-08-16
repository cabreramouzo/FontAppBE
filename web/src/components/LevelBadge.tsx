import { useState } from 'react'
import Box from '@mui/material/Box'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import { levelBadgeURL } from '../lib/levelBadges'
import { useI18n } from '../i18n/I18nContext'

/**
 * Cómo se apaga una insignia que aún no tienes. Gris y oscurecida, no solo
 * transparente: bajar la opacidad sobre fondo claro la deja lavada y sobre fondo
 * oscuro casi invisible, mientras que quitar el color y bajar el brillo da la misma
 * silueta en los dos temas.
 */
const APAGADA = { filter: 'grayscale(1) brightness(0.62) contrast(0.85)', opacity: 0.5 }

/**
 * La chapa del nivel: el emblema dibujado, si ese nivel ya tiene el suyo.
 *
 * **No sustituye al nombre del nivel, lo acompaña.** Dos razones y las dos importan:
 * el rótulo va pintado dentro del dibujo y en castellano, así que a 120 px no se lee
 * y en catalán o euskera diría lo que no es; y mientras falten insignias por dibujar,
 * el nombre es lo único que tienen los demás niveles. El nombre manda; esto es
 * decoración.
 *
 * Por eso el `alt` va vacío: lo que dice la imagen ya está escrito al lado en el
 * idioma correcto, y un lector de pantalla que leyera «Gota» dos veces —una de ellas
 * siempre en castellano— molestaría más de lo que ayuda.
 *
 * - `locked`: se pinta como silueta gris.
 * - `placeholder`: en la vitrina todos los peldaños necesitan casilla aunque su dibujo
 *   no exista todavía; en el marcador no, y ahí es mejor no dejar hueco.
 */
export function LevelBadge({
  levelKey,
  size = 104,
  locked = false,
  placeholder = false,
}: {
  levelKey: string
  size?: number
  locked?: boolean
  placeholder?: boolean
}) {
  const { t } = useI18n()
  const [roto, setRoto] = useState(false)
  const url = levelBadgeURL(levelKey)
  const nombre = t(`game.level.${levelKey}`)

  if (!url || roto) {
    if (!placeholder) return null
    // Sin dibujo todavía: una gota dentro de un disco. Con el mismo tratamiento gris
    // cuando está bloqueada, para que la rejilla se lea igual de arriba abajo.
    return (
      <Box
        aria-hidden
        sx={{
          width: size, height: size, flexShrink: 0, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'action.hover',
          border: '2px dashed', borderColor: 'divider',
          color: locked ? 'text.disabled' : 'primary.main',
          ...(locked ? APAGADA : null),
        }}
      >
        <WaterDropOutlinedIcon sx={{ fontSize: size * 0.4 }} />
      </Box>
    )
  }

  return (
    <Box
      component="img"
      src={url}
      alt=""
      // El fichero está fuera del paquete: sin ancho y alto reservados, la tarjeta
      // pega un salto cuando llega.
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setRoto(true)}
      title={nombre}
      sx={{ width: size, height: size, flexShrink: 0, objectFit: 'contain', ...(locked ? APAGADA : null) }}
    />
  )
}

export { APAGADA }
