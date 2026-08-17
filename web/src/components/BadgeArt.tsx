import { useState } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { TIER_COLOR } from '../lib/tierColors'
import { badgeArtURL } from '../lib/levelBadges'
import { useI18n } from '../i18n/I18nContext'
import { APAGADA } from './LevelBadge'

/**
 * El escudo dibujado de una familia de insignias, cuando lo tiene.
 *
 * Devuelve `null` si esa familia todavía va con icono, y quien lo use tiene que
 * tener preparada esa alternativa: hoy solo está dibujada `pioneer`, y las de
 * bronce/plata/oro seguramente nunca lo estén — son el mismo dibujo en tres
 * metales y esa biblioteca no se mantiene sola (ver `BADGE_ART`).
 *
 * `alt` vacío por lo mismo que en `LevelBadge`: el nombre de la insignia ya va
 * escrito al lado, en el idioma del navegador, y el dibujo lleva el suyo dentro
 * en castellano.
 */
export function BadgeArt({
  family,
  size = 88,
  locked = false,
  tier = null,
}: {
  family: string
  size?: number
  locked?: boolean
  /** Grado conseguido. El dibujo es el mismo en los tres; lo que cambia es el aro. */
  tier?: string | null
}) {
  const { t } = useI18n()
  const modo = useTheme().palette.mode === 'dark' ? 'dark' : 'light'
  const [roto, setRoto] = useState(false)
  const url = badgeArtURL(family)
  if (!url || roto) return null

  // El aro solo para las de tres grados: en las de grado único —y en las especiales, que
  // tampoco tienen metal— no distingue nada y solo añade un círculo alrededor de un
  // escudo que ya trae su propio marco dibujado. `special` va nombrado y no se deja caer
  // en el `?? undefined` de la tabla: el día que alguien le dé un color a las especiales,
  // esto dibujaría dos anillos concéntricos sin que nadie lo hubiera pedido.
  const sinAro = tier === 'unique' || tier === 'special'
  const aro = !locked && tier && !sinAro ? TIER_COLOR[modo][tier] : null

  const img = (
    <Box
      component="img"
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setRoto(true)}
      title={t(`game.badge.${family}`)}
      sx={{ width: size, height: size, flexShrink: 0, objectFit: 'contain', ...(locked ? APAGADA : null) }}
    />
  )

  if (!aro) return img
  return (
    <Box
      sx={{
        display: 'flex', borderRadius: '50%', p: '3px',
        // Un aro y no un tinte sobre el dibujo: teñir un escudo de plata lo deja gris y
        // apagado, que es justo como se pinta aquí lo que NO se ha conseguido.
        border: '2px solid', borderColor: aro,
      }}
    >
      {img}
    </Box>
  )
}
