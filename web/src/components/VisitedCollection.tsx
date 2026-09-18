import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import Collapse from '@mui/material/Collapse'
import CollectionsBookmarkOutlinedIcon from '@mui/icons-material/CollectionsBookmarkOutlined'
import { collectionFonts, visitedCollection } from '../api/client'
import type { CollectionFont, VisitedCollection as Collection } from '../api/client'
import type { WaterSource } from '../api/types'
import { SOURCE_EMOJI } from '../lib/waterType'
import { positionIfAllowed } from '../lib/quietPosition'
import { useI18n } from '../i18n/I18nContext'
import { nombreFuente } from '../lib/fontName'
import { TituloDeSeccion } from './TituloDeSeccion'
import { ListaConTope } from './ListaConTope'
import { FilaDeFuente } from './FilaDeFuente'
import { Skeleton } from './Skeleton'

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
  const { t, lang } = useI18n()
  const [data, setData] = useState<Collection | null>(null)
  // El tipo desplegado y su lista de fuentes. Uno a la vez: tocar otro cierra el anterior,
  // para no llenar el perfil. `fuentes === null` mientras carga esa lista.
  const [abierto, setAbierto] = useState<WaterSource | null>(null)
  const [fuentes, setFuentes] = useState<CollectionFont[] | null>(null)

  function alternarTipo(source: WaterSource) {
    if (abierto === source) { setAbierto(null); return }
    setAbierto(source)
    setFuentes(null)
    collectionFonts(source)
      .then((fs) => { setFuentes(fs) })
      .catch(() => { setFuentes([]) })
  }

  useEffect(() => {
    // La posición **sin pedir permiso**: un perfil no debe lanzar el diálogo de ubicación
    // a bocajarro. Si ya estaba concedido, se añade el objetivo local; si no, la Pokédex
    // se ve igual sin ese bloque. No se espera a la posición para nada más.
    let vivo = true
    positionIfAllowed()
      .then((pos) => (vivo ? visitedCollection(pos) : null))
      .then((d) => { if (vivo && d) setData(d) })
      .catch(() => { if (vivo) setData(null) })
    return () => { vivo = false }
  }, [])

  if (!data || data.visited === 0) return null
  const conseguidos = data.types.filter((tp) => tp.count > 0).length
  const local = data.local
  const localPct = local && local.nearby > 0 ? Math.round((local.visited / local.nearby) * 100) : 0

  return (
    <Box component="section" sx={{ mb: 3 }}>
      <TituloDeSeccion icono={<CollectionsBookmarkOutlinedIcon fontSize="small" />}>
        {t('game.collection.title')}
      </TituloDeSeccion>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', lineHeight: 1 }}>{data.visited}</Typography>
        <Typography variant="body2" color="text.secondary">{t('game.collection.visited')}</Typography>
      </Box>

      {/* El objetivo **terminable**: de tu alrededor, cuántas llevas. Solo si el navegador
          ya tenía la ubicación concedida y hay fuentes cerca. Es lo que convierte el
          contador de por vida en una misión que se puede completar. */}
      {local && local.nearby > 0 && (
        <Box sx={{ mb: 2, maxWidth: 420 }}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            {t('game.collection.localGoal', { v: String(local.visited), n: String(local.nearby) })}
          </Typography>
          <LinearProgress variant="determinate" value={localPct} sx={{ height: 8, borderRadius: 4 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {t('game.collection.localRadius', { km: local.radiusKm.toLocaleString(lang) })}
          </Typography>
        </Box>
      )}

      {/* Los seis tipos, en fila. El que tienes va en color con su recuento; el que falta,
          apagado — «5 de 6» invita, esconder el que falta no. */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        {t('game.collection.types', { have: String(conseguidos), total: String(data.types.length) })}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {data.types.map((tp) => {
          const tiene = tp.count > 0
          const activo = abierto === tp.source
          return (
            <Tooltip
              key={tp.source}
              title={`${t(`source.${tp.source}`)}${tiene ? ` · ${tp.count}` : ''}`}
            >
              {/* Con fuentes coleccionadas el medallón es un botón: ves el número y lo
                  natural es tocarlo para ver cuáles son. El tipo que aún no tienes no es
                  pulsable —no hay lista que enseñar—. */}
              <Box
                component={tiene ? 'button' : 'div'}
                type={tiene ? 'button' : undefined}
                onClick={tiene ? () => alternarTipo(tp.source) : undefined}
                aria-expanded={tiene ? activo : undefined}
                sx={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                  width: 64, minHeight: 52, borderRadius: 2, px: 0.5, py: 0.75,
                  font: 'inherit', color: 'inherit', textAlign: 'center',
                  cursor: tiene ? 'pointer' : 'default',
                  bgcolor: activo ? 'action.selected' : tiene ? 'action.hover' : 'transparent',
                  border: '1px solid', borderColor: activo ? 'primary.main' : 'divider',
                  opacity: tiene ? 1 : 0.4,
                  filter: tiene ? 'none' : 'grayscale(1)',
                  transition: 'background-color .15s ease, border-color .15s ease',
                  '&:hover': tiene ? { bgcolor: 'action.selected' } : undefined,
                }}
              >
                <Box component="span" sx={{ fontSize: '1.5rem', lineHeight: 1 }}>{SOURCE_EMOJI[tp.source]}</Box>
                {/* El rótulo bajo cada emoji: sin él, un cubo (que es un pozo) o una gota
                    no dicen qué tipo son. Una palabra (`source.short.*`), no la frase larga
                    de `source.*`, que no cabe bajo un icono de 64 px. */}
                <Typography
                  sx={{ fontSize: '0.6rem', lineHeight: 1.2, mt: 0.25, textAlign: 'center', color: 'text.secondary' }}
                >
                  {t(`source.short.${tp.source}`)}
                </Typography>
                {tiene && (
                  <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', lineHeight: 1.4 }}>{tp.count}</Typography>
                )}
              </Box>
            </Tooltip>
          )
        })}
      </Box>

      {/* La lista del tipo abierto, desplegada en el sitio. Filtrar la colección por tipo es
          justo lo que «Tus reseñas» no puede hacer, así que no es otra lista repetida. Con
          `ListaConTope` para que un tipo con muchas fuentes no estire el perfil. */}
      <Collapse in={abierto !== null} unmountOnExit>
        <Box sx={{ mt: 1.5 }}>
          {abierto !== null && (
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
              {SOURCE_EMOJI[abierto]} {t(`source.${abierto}`)}
            </Typography>
          )}
          {fuentes === null && <Skeleton lines={3} />}
          {fuentes && fuentes.length > 0 && (
            <ListaConTope
              items={fuentes}
              clave={(f) => f.id}
              fila={(f) => (
                <FilaDeFuente
                  to={`/fonts/${f.id}`}
                  source={f.source}
                  primary={nombreFuente(f, t)}
                  secondary={f.municipality ?? f.region ?? undefined}
                />
              )}
            />
          )}
        </Box>
      </Collapse>
    </Box>
  )
}
