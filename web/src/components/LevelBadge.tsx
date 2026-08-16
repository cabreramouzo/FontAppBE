import { useState } from 'react'
import Box from '@mui/material/Box'
import { levelBadgeURL } from '../lib/levelBadges'
import { useI18n } from '../i18n/I18nContext'

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
 */
export function LevelBadge({ levelKey, size = 104 }: { levelKey: string; size?: number }) {
  const { t } = useI18n()
  const [roto, setRoto] = useState(false)
  const url = levelBadgeURL(levelKey)
  if (!url || roto) return null

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
      title={t(`game.level.${levelKey}`)}
      sx={{ width: size, height: size, flexShrink: 0, objectFit: 'contain' }}
    />
  )
}
