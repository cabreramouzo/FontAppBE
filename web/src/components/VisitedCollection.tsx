import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import CollectionsBookmarkOutlinedIcon from '@mui/icons-material/CollectionsBookmarkOutlined'
import { visitedCollection } from '../api/client'
import type { VisitedCollection as Collection } from '../api/client'
import { SOURCE_EMOJI } from '../lib/waterType'
import { useI18n } from '../i18n/I18nContext'
import { TituloDeSeccion } from './TituloDeSeccion'

/**
 * La «Pokédex»: fuentes visitadas y tipos coleccionados. Fase de colección del plan de
 * visitas (docs/gamificacion-visitas.md). Visitar = haber reseñado, la misma adaptación
 * que el guardián: es lo único que deja constancia verificable de haber estado allí.
 *
 * A diferencia de las cuatro listas del perfil, esto no es otra lista de fuentes —sería
 * casi «tus reseñas»— sino la parte de **colección completa**: de los seis tipos que hay,
 * cuáles tienes. Ese es el conjunto cerrado que se completa, que es lo que engancha.
 *
 * No se pinta si apagó la gamificación (204 → null) ni si aún no ha visitado nada: una
 * Pokédex vacía el primer día no invita, solo dice que vas último.
 */
export function VisitedCollection() {
  const { t } = useI18n()
  const [data, setData] = useState<Collection | null>(null)

  useEffect(() => {
    visitedCollection().then(setData).catch(() => setData(null))
  }, [])

  if (!data || data.visited === 0) return null
  const conseguidos = data.types.filter((tp) => tp.count > 0).length

  return (
    <Box component="section" sx={{ mb: 3 }}>
      <TituloDeSeccion icono={<CollectionsBookmarkOutlinedIcon fontSize="small" />}>
        {t('game.collection.title')}
      </TituloDeSeccion>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', lineHeight: 1 }}>{data.visited}</Typography>
        <Typography variant="body2" color="text.secondary">{t('game.collection.visited')}</Typography>
      </Box>

      {/* Los seis tipos, en fila. El que tienes va en color con su recuento; el que falta,
          apagado — «5 de 6» invita, esconder el que falta no. */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        {t('game.collection.types', { have: String(conseguidos), total: String(data.types.length) })}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {data.types.map((tp) => {
          const tiene = tp.count > 0
          return (
            <Tooltip
              key={tp.source}
              title={`${t(`source.${tp.source}`)}${tiene ? ` · ${tp.count}` : ''}`}
            >
              <Box
                sx={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  width: 52, minHeight: 52, borderRadius: 2, px: 0.5, py: 0.75,
                  bgcolor: tiene ? 'action.hover' : 'transparent',
                  border: '1px solid', borderColor: 'divider',
                  opacity: tiene ? 1 : 0.4,
                  filter: tiene ? 'none' : 'grayscale(1)',
                }}
              >
                <Box component="span" sx={{ fontSize: '1.5rem', lineHeight: 1 }}>{SOURCE_EMOJI[tp.source]}</Box>
                {tiene && (
                  <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', lineHeight: 1.4 }}>{tp.count}</Typography>
                )}
              </Box>
            </Tooltip>
          )
        })}
      </Box>
    </Box>
  )
}
