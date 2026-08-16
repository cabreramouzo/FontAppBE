import { useState } from 'react'
import Box from '@mui/material/Box'
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
}: {
  family: string
  size?: number
  locked?: boolean
}) {
  const { t } = useI18n()
  const [roto, setRoto] = useState(false)
  const url = badgeArtURL(family)
  if (!url || roto) return null

  return (
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
}
