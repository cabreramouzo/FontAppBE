import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'
import { BadgeArt } from './BadgeArt'
import { BadgeIcon } from './BadgeIcon'
import { Abrible } from './BadgeShowcase'
import { BADGE_ART } from '../lib/levelBadges'
import { TIER_COLOR } from '../lib/tierColors'
import { APAGADA } from './LevelBadge'

/**
 * Las insignias **de esta fuente**: quién se ha llevado cada una y cuáles siguen libres.
 *
 * No es la colección entera. En la vitrina del perfil tienen sentido las veinte familias,
 * pero aquí «Internacional» o «Constancia» no dicen nada de esta fuente: se ganan con el
 * conjunto de lo que aportas, no viniendo a este pilón. Solo salen las que se ganan
 * **aquí**, y por eso cada línea puede nombrar a alguien o invitarte a ti.
 *
 * Las libres son la mitad interesante: «todavía no tiene ni una foto» es una tarea
 * concreta, con un premio concreto, a diez metros de donde estás leyéndolo. Es el mismo
 * argumento de las rutas propuestas, pero puesto donde ya has llegado por tu cuenta.
 *
 * ## Lo que NO se afirma
 *
 * - **Pionero solo existe en fuentes importadas** (las que no tienen creador). Si la puso
 *   alguien, quien la reseñó primero no cobra esa insignia, así que la línea no aparece:
 *   ofrecer un premio que el servidor no va a dar es peor que no ofrecer nada.
 * - **Primera luz** se atribuye por la reseña con foto más antigua. Puede que la foto
 *   llegara por una edición, y las ediciones no se ven desde aquí: en ese caso se dice
 *   que está conseguida pero no por quién, que es exactamente lo que sabe la ficha.
 * - **Centinela** solo se enseña cuando está **en juego**. Reconstruir quién despertó la
 *   fuente en el pasado pide los huecos entre reseñas y el baremo del día en que ocurrió;
 *   lo que sí se puede decir sin equivocarse es que ahora mismo está dormida.
 */
export function FontBadges({
  creatorName,
  creatorTier,
  pioneerUsername,
  pioneerCounts,
  hasPhoto,
  photoAuthor,
  daysSinceLastCheck,
  neverChecked,
  onOpen,
}: {
  creatorName: string | null
  creatorTier: string | null
  pioneerUsername: string | null
  /** Pionero solo se gana en fuentes sin creador. */
  pioneerCounts: boolean
  hasPhoto: boolean
  /** Autor de la reseña con foto más antigua, si la foto vino por ahí. */
  photoAuthor: string | null
  daysSinceLastCheck: number | null
  neverChecked: boolean
  onOpen: (family: string, tier: string | null, locked: boolean, subtitle?: string) => void
}) {
  const { t } = useI18n()
  const tierColor = TIER_COLOR[useTheme().palette.mode === 'dark' ? 'dark' : 'light']

  /** Los mismos 90 días a partir de los cuales la curva de frescura paga «centinela». */
  const DORMIDA = 91

  // `ganada` va aparte de `by` a propósito: «Primera luz» puede estar conseguida y no
  // saberse por quién (la foto llegó por una edición), y ahí la insignia debe salir en
  // color aunque no haya nombre que enlazar.
  type Fila = { family: string; ganada: boolean; by: string | null; tier: string | null; hint: string | null }
  const filas: Fila[] = []

  filas.push(creatorName
    ? { family: 'discoverer', ganada: true, by: creatorName, tier: creatorTier, hint: null }
    : { family: 'discoverer', ganada: false, by: null, tier: null, hint: t('detail.badges.imported') })

  if (pioneerCounts) {
    filas.push(pioneerUsername
      ? { family: 'pioneer', ganada: true, by: pioneerUsername, tier: null, hint: null }
      : { family: 'pioneer', ganada: false, by: null, tier: null, hint: t('detail.badges.noReview') })
  }

  filas.push(hasPhoto
    ? { family: 'firstLight', ganada: true, by: photoAuthor, tier: null, hint: photoAuthor ? null : t('detail.badges.unknownAuthor') }
    : { family: 'firstLight', ganada: false, by: null, tier: null, hint: t('detail.badges.noPhoto') })

  if (!neverChecked && daysSinceLastCheck != null && daysSinceLastCheck >= DORMIDA) {
    filas.push({
      family: 'sentinel', ganada: false, by: null, tier: null,
      hint: t('detail.badges.stale', { n: String(daysSinceLastCheck) }),
    })
  }

  return (
    <Box component="section" sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>{t('detail.badges.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('detail.badges.intro')}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {filas.map((f) => {
          const ganada = f.ganada
          const nombre = t(`game.badge.${f.family}`)
          return (
            <Box key={f.family} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Abrible
                puede
                nombre={nombre}
                onOpen={() => onOpen(f.family, f.tier, !ganada, f.by ? `@${f.by}` : (f.hint ?? undefined))}
              >
                {/* `BadgeArt` ya apaga la suya con `locked`; aplicarle además `APAGADA`
                    aquí la oscurecía dos veces y sobre tema oscuro casi desaparecía. El
                    icono de respaldo sí necesita que se lo apaguemos nosotros. */}
                {BADGE_ART.has(f.family) ? (
                  <BadgeArt family={f.family} size={40} tier={f.tier} locked={!ganada} />
                ) : (
                  <Box sx={{ display: 'flex', ...(ganada ? null : APAGADA) }}>
                    <BadgeIcon family={f.family} sx={{ fontSize: 32, color: (f.tier && tierColor[f.tier]) || 'text.secondary' }} />
                  </Box>
                )}
              </Abrible>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }} color={ganada ? 'text.primary' : 'text.secondary'}>
                  {nombre}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                  {f.by
                    ? <>{t('detail.badges.by')}{' '}
                        <Link component={RouterLink} to={`/users/${encodeURIComponent(f.by)}`}>@{f.by}</Link></>
                    : f.hint}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
