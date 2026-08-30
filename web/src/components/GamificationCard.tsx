import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Button from '@mui/material/Button'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Collapse from '@mui/material/Collapse'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import { getGamification } from '../api/client'
import type { GamificationProfile } from '../api/types'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'
import { LevelBadge } from './LevelBadge'
import { Abrible, BadgeShowcase } from './BadgeShowcase'
import { GamificationHelpButton } from './GamificationHelp'
import { LEVEL_BADGES } from '../lib/levelBadges'
import { TIER_COLOR } from '../lib/tierColors'

/**
 * El marcador de gamificación en el perfil. Fase 3 del plan (docs/gamificacion.md).
 *
 * El orden de lectura está elegido: primero **el impacto sobre el mapa** y después los
 * puntos. «12 fuentes tienen foto gracias a ti» dice algo verdadero del mundo; «1 240
 * gotas» solo dice algo del contador. Quien no quiera jugar se queda con lo primero y no
 * ha perdido nada.
 *
 * No se pinta nada si el usuario la tiene apagada (el backend responde 204) ni si todavía
 * no ha aportado nada: un marcador a cero el primer día no motiva, avisa de que vas último.
 */
export function GamificationCard() {
  const { t, lang } = useI18n()
  const tier = TIER_COLOR[useTheme().palette.mode === 'dark' ? 'dark' : 'light']
  const [data, setData] = useState<GamificationProfile | null>(null)
  const [cargando, setCargando] = useState(true)
  // Qué insignia se está mirando en grande, o `null`. Mismo visor que la vitrina:
  // se llega a las medallas antes desde aquí que desde `/me/badges`, así que si se
  // pueden abrir allí y aquí no, lo que parece es que aquí está roto.
  const [mirando, setMirando] = useState<
    { kind: 'level' | 'badge'; key: string; tier: string | null; subtitle?: string } | null
  >(null)
  /** Lo que abre el nivel nace plegado: se consulta al subir, no en cada visita. */
  const [abiertoAbre, setAbiertoAbre] = useState(false)

  useEffect(() => {
    getGamification()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setCargando(false))
  }, [])

  if (cargando || !data) return null
  const aportaAlgo = data.gotes > 0 || data.pending > 0
  if (!aportaAlgo) return null

  const { impact } = data
  const impactos = [
    { icon: <PhotoCameraOutlinedIcon fontSize="small" />, n: impact.fontsWithPhotoThanksToYou, label: t('game.impact.photos') },
    { icon: <VisibilityOutlinedIcon fontSize="small" />, n: impact.fontsYouKeepFresh, label: t('game.impact.fresh') },
    { icon: <AddLocationAltOutlinedIcon fontSize="small" />, n: impact.fontsYouPutOnTheMap, label: t('game.impact.created') },
  ].filter((i) => i.n > 0)

  // Progreso hacia el siguiente nivel. Sin siguiente (nivel máximo) no se pinta barra.
  const restan = data.gotesToNextLevel ?? 0
  const progreso = data.nextLevel && restan > 0
    ? Math.max(0, Math.min(100, (data.gotes / (data.gotes + restan)) * 100))
    : null

  return (
    <Box component="section" sx={{ mb: 3 }}>
      {/* El (?) al lado del título y no al final de la tarjeta: la duda («¿de dónde
          salen estas gotas?») nace al leer el encabezado, no después de las cifras. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <Typography variant="h6">{t('game.title')}</Typography>
        <GamificationHelpButton />
      </Box>

      {impactos.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
          {impactos.map((i) => (
            <Box
              key={i.label}
              sx={{
                flex: '1 1 150px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 1,
                p: 1.5, borderRadius: 2, bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ color: 'primary.main', display: 'flex', pt: '2px' }}>{i.icon}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, lineHeight: 1.1, fontSize: '1.4rem' }}>{i.n}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25, display: 'block' }}>
                  {i.label}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* La chapa a la izquierda y las cifras a la derecha. Va DESPUÉS del impacto y no
          antes: por vistosa que sea, «17 fuentes tienen foto gracias a ti» sigue siendo lo
          primero que hay que leer. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Abrible
          puede={LEVEL_BADGES.has(data.level)}
          nombre={t(`game.level.${data.level}`)}
          // Misma línea de apoyo que la vitrina («Desde 800 gotas»). Sin ella el visor
          // del nivel salía con el nombre a secas mientras el de una insignia decía
          // «3 de 5», y desde aquí parecía que al nivel le faltaba media pantalla.
          onOpen={() => setMirando({
            kind: 'level', key: data.level, tier: null,
            subtitle: (() => {
              const n = data.levels.find((l) => l.key === data.level)
              if (!n) return undefined
              return n.from === 0 ? t('badges.start') : t('badges.fromGotes', { n: n.from.toLocaleString(lang) })
            })(),
          })}
        >
          <LevelBadge levelKey={data.level} />
        </Abrible>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <WaterDropOutlinedIcon fontSize="small" sx={{ color: 'primary.main', alignSelf: 'center' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '1.25rem' }}>
          {data.gotes.toLocaleString(lang)}
        </Typography>
        <Typography color="text.secondary">{t('game.gotes')}</Typography>
        {/* El backend manda la clave del nivel (`river`), no su nombre: el rótulo se
            traduce aquí. Antes llegaba «Río» hecho y salía en castellano en las cinco. */}
        <Chip label={t(`game.level.${data.level}`)} size="small" sx={{ ml: 0.5, fontWeight: 700 }} />
        {/* El ascenso ya ganado pero aún sin liquidar. Sin esto, la felicitación decía
            «has subido de nivel» y la tarjeta seguía enseñando el peldaño viejo durante
            72 h: las dos tenían razón por separado y juntas parecían una avería. Mismo
            tratamiento que las insignias «en camino». */}
        {data.pendingLevel && (
          <Tooltip title={t('game.pendingLevelHint')}>
            <Chip
              size="small" color="warning" variant="outlined"
              label={t('game.pendingLevel', { level: t(`game.level.${data.pendingLevel}`) })}
              sx={{ ml: 0.5, fontWeight: 700 }}
            />
          </Tooltip>
        )}
        {data.pending > 0 && (
          <Tooltip title={t('game.pendingHint')}>
            <Chip
              label={t('game.pending', { n: String(data.pending) })}
              size="small" variant="outlined" color="warning"
            />
          </Tooltip>
        )}
      </Box>

      {progreso !== null && (
        <Box sx={{ mt: 1, maxWidth: 420 }}>
          <LinearProgress variant="determinate" value={progreso} sx={{ height: 6, borderRadius: 3 }} />
          <Typography variant="caption" color="text.secondary">
            {t('game.toNext', {
              n: restan.toLocaleString(lang),
              level: data.nextLevel ? t(`game.level.${data.nextLevel}`) : '',
            })}
          </Typography>
        </Box>
      )}
        </Box>
      </Box>

      {/* ## Qué abre el nivel, plegado
          Fase 6. Solo se enseña si abre algo — anunciar una lista de permisos que no
          tienes convierte el marcador en una pantalla de bloqueos, y el sistema está
          apagado por defecto, así que para casi todo el mundo no diría nada verdadero.
          Los motivos del bloqueo viajan en `grant.blockedBy` y se usan donde la acción
          está, no aquí.

          **Va plegado, y esa es la corrección.** En el nivel 6 son SEIS chips, uno por
          línea porque el texto es largo, más las dos líneas de lo que viene después: unos
          230 px de permisos en medio de un marcador que existe para decir cuántas gotas
          llevas. Y son cosas que se consultan una vez —cuando subes de nivel— y no cada
          vez que abres tu perfil. El recuento en el rótulo conserva lo único que hay que
          ver de un vistazo («abre 6 acciones»); lo demás está a un toque, y la explicación
          completa sigue en `/gamification`.

          **«Acciones» y no «cosas», «poderes», «capacidades» ni «permisos».** «Cosas» era
          relleno justo en el rótulo que tiene que justificar el pliegue. «Capacidades» es
          la palabra del código y suena a ficha técnica. «Poderes» se lee mejor como premio
          pero contradice la regla que ordena la escalera —un nivel abre poder sobre el
          mapa y nunca sobre la gente, y por eso el nivel 10 es candidatura y no
          concesión—, y «permisos» es el vocabulario de los roles y la moderación, o sea
          el mismo eje de autoridad sobre personas que esto evita. Lo que hay debajo son
          literalmente acciones sobre una fuente: mover el pin, añadir una foto, retirarla.

          El plural no se dobla porque no hace falta: el primer nivel que abre algo abre
          dos a la vez, así que `n` nunca vale 1. */}
      {(data.grant?.capabilities.length ?? 0) > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Button
            onClick={() => setAbiertoAbre((v) => !v)}
            aria-expanded={abiertoAbre}
            size="small"
            endIcon={<ExpandMoreIcon sx={{ transform: abiertoAbre ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />}
            sx={{ textTransform: 'none', ml: -1, color: 'text.secondary' }}
          >
            {t('game.unlockedCount', { n: String(data.grant?.capabilities.length ?? 0) })}
          </Button>
          <Collapse in={abiertoAbre} unmountOnExit>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
              {data.grant?.capabilities.map((c) => (
                <Chip
                  key={c}
                  icon={<KeyOutlinedIcon />}
                  label={t(`game.can.${c}`)}
                  size="small"
                  variant="outlined"
                  color="success"
                  sx={{ fontWeight: 600 }}
                />
              ))}
            </Box>

            {/* Y lo que todavía no. Antes el marcador solo nombraba lo ya concedido, así
                que para casi todo el mundo —el sistema está apagado por defecto— la
                escalera no llevaba visiblemente a ninguna parte. Va DENTRO del pliegue:
                es la continuación de la misma lista, y fuera volvía a cargar la tarjeta
                de lo que este cambio viene a quitarle. */}
            {(data.grant?.upcoming?.length ?? 0) > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {t('game.willUnlock')}
                </Typography>
                {data.grant?.upcoming?.map((c) => (
                  <Typography key={c.key} variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    <strong>{t(`game.level.${c.level}`)}</strong> — {t(`game.can.${c.key}`)}
                  </Typography>
                ))}
              </Box>
            )}

            <Button component={RouterLink} to="/gamification" size="small" sx={{ textTransform: 'none', ml: -1 }}>
              {t('gameHelp.readMore')}
            </Button>
          </Collapse>
        </Box>
      )}

      {data.badges.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
          {data.badges.map((b) => (
            <Tooltip key={b.family} title={t('game.badgeProgress', { n: String(b.progress), m: String(b.threshold) })}>
              {/* Los chips también abren el visor, y no solo la chapa de nivel: aquí las
                  insignias son texto y es donde menos se ven, así que es justo donde más
                  se agradece poder mirarlas en grande. Los que no tienen dibujo abren
                  igual — el visor cae al nombre en grande y no deja un hueco negro. */}
              <Abrible
                puede
                redondo={false}
                nombre={t(`game.badge.${b.family}`)}
                onOpen={() => setMirando({
                  kind: 'badge', key: b.family, tier: b.tier,
                  subtitle: t('game.badgeProgress', { n: String(b.progress), m: String(b.threshold) }),
                })}
              >
                <Chip
                  label={`${t(`game.badge.${b.family}`)} · ${t(`game.tier.${b.tier}`)}`}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: tier[b.tier] ?? 'text.primary',
                    borderColor: tier[b.tier] ?? 'divider',
                  }}
                  variant="outlined"
                />
              </Abrible>
            </Tooltip>
          ))}
        </Box>
      )}

      {data.byKind.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          {data.byKind.map((k) => (
            <Typography key={k.kind} variant="body2" color="text.secondary">
              {k.count} × {k.label} — {k.gotes.toLocaleString(lang)} {t('game.gotes')}
            </Typography>
          ))}
        </Box>
      )}

      {/* La colección completa vive en su propia página: una rejilla de trofeos aquí
          desplazaría el impacto sobre el mapa, que es lo que hay que leer primero. */}
      <Button
        component={RouterLink}
        to="/me/badges"
        size="small"
        endIcon={<ChevronRightIcon />}
        sx={{ textTransform: 'none', mt: 1, ml: -1 }}
      >
        {t('badges.seeAll')}
      </Button>

      {/* Se avisa mientras el baremo se calibra. Prometer que los puntos no cambian y que
          cambien es peor que decir desde el principio que aún se están ajustando. */}
      {data.provisional && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {t('game.provisional')}
        </Typography>
      )}

      <BadgeShowcase
        open={!!mirando}
        onClose={() => setMirando(null)}
        kind={mirando?.kind ?? 'badge'}
        badgeKey={mirando?.key ?? ''}
        tier={mirando?.tier ?? null}
        subtitle={mirando?.subtitle}
      />
    </Box>
  )
}
