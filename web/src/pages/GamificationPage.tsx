import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import { getGamificationScale } from '../api/client'
import type { GamificationScale } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { Skeleton } from '../components/Skeleton'
import { LevelBadge } from '../components/LevelBadge'
import { BadgeArt } from '../components/BadgeArt'
import { BadgeIcon } from '../components/BadgeIcon'
import { Abrible, BadgeShowcase } from '../components/BadgeShowcase'
import { ExplicacionBaremo, Apartado } from '../components/GamificationHelp'
import { BADGE_ART, LEVEL_BADGES } from '../lib/levelBadges'

/**
 * `/gamification` — qué son las gotas, los niveles y las insignias. **Pública.**
 *
 * ## Por qué una página y no otro diálogo
 *
 * La explicación existía ya: el botón (?) del perfil. Pero colgaba de la tarjeta de
 * gamificación, y esa tarjeta **no se pinta hasta que has aportado algo** (un marcador a
 * cero el primer día no motiva, avisa de que vas último). El resultado era que la única
 * explicación del sistema estaba escondida detrás de haberlo entendido ya. Quien acaba
 * de registrarse —o quien todavía no— no tenía forma de llegar.
 *
 * Por eso esta página no pide sesión y no toca la base de datos: se sirve entera de
 * `GET /gamification/scale`, que es pública. Se puede enlazar desde un cartel, desde un
 * correo o desde un mensaje, y funciona.
 *
 * ## Qué añade sobre el (?)
 *
 * El diálogo explica **el baremo** y se reutiliza tal cual (`ExplicacionBaremo`, un solo
 * texto para los dos sitios). Lo que falta aquí arriba es lo otro: la **escalera** de
 * diez niveles con sus umbrales y las **familias** de insignias, que hasta ahora solo
 * se veían en la vitrina del propio perfil. Sin sesión no hay progreso que enseñar, así
 * que van como catálogo: esto existe y esto es lo que cuesta.
 *
 * Las cifras —umbrales incluidos— vienen todas del servidor. Es la regla de siempre en
 * esta parte de la app: el baremo se ha recalibrado varias veces y una explicación que
 * no cuadra con tu marcador es peor que no dar ninguna.
 */
export function GamificationPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const [escala, setEscala] = useState<GamificationScale | null>(null)
  const [fallo, setFallo] = useState(false)
  const [mirando, setMirando] = useState<
    { kind: 'level' | 'badge'; key: string; subtitle?: string } | null
  >(null)

  useEffect(() => {
    getGamificationScale().then(setEscala).catch(() => setFallo(true))
  }, [])

  const n = (v: number) => v.toLocaleString(lang)

  // Un backend más viejo que esta página no manda `levels` ni `families`, y
  // `undefined.map` deja la pantalla en negro entera: React desmonta el árbol y queda el
  // fondo del `body`. Es el tercer aviso del mismo tipo (`tier`, `fromDays`, esto), así
  // que aquí se lee a la defensiva y las secciones se callan si no hay datos. El baremo,
  // que sí llega, se sigue viendo: media explicación es mucho mejor que ninguna.
  const niveles = escala?.levels ?? []
  const familias = escala?.families ?? []

  /** «Bronce a 10 · oro a 200», o el grado único. Tolera una familia sin umbrales. */
  function grados(f: { thresholds: number[]; unique: boolean }): string {
    const u = f.thresholds ?? []
    if (f.unique || u.length === 0) return t('gamePage.uniqueTier')
    return t('gamePage.tiers', { a: n(u[0]), b: n(u[u.length - 1]) })
  }

  return (
    <Box className="pad" sx={{ maxWidth: 760, mx: 'auto' }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
        💧 {t('gamePage.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        {t('gamePage.lead')}
      </Typography>

      {!escala && !fallo && <Skeleton lines={10} />}
      {fallo && <Typography color="text.secondary">{t('badges.failed')}</Typography>}

      {escala && (
        <>
          {/* La escalera. Se lee subiendo, y por eso el backend la manda ya del revés. */}
          {niveles.length > 0 && (
          <Apartado titulo={t('gamePage.levels')}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t('gamePage.levelsLead')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                // Cinco columnas en pantalla ancha, dos en el móvil: diez peldaños en una
                // sola fila serían diez sellos de 30 px que no se distinguen.
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' },
                gap: 2,
              }}
            >
              {niveles.map((n2) => (
                <Box key={n2.key} sx={{ textAlign: 'center' }}>
                  <Abrible
                    puede={LEVEL_BADGES.has(n2.key)}
                    nombre={t(`game.level.${n2.key}`)}
                    onOpen={() => setMirando({
                      kind: 'level', key: n2.key,
                      subtitle: n2.from === 0 ? t('badges.start') : t('badges.fromGotes', { n: n(n2.from) }),
                    })}
                  >
                    <LevelBadge levelKey={n2.key} size={72} placeholder />
                  </Abrible>
                  <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5, lineHeight: 1.2 }}>
                    {t(`game.level.${n2.key}`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {n2.from === 0 ? t('badges.start') : t('badges.fromGotes', { n: n(n2.from) })}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Apartado>
          )}

          {/* Qué abre la escalera. Va **debajo de los niveles** y no al final: sin esto,
              los diez peldaños eran diez nombres bonitos sin consecuencia, y la pregunta
              que deja «Riachuelo, desde 1.700 gotas» es exactamente «¿y eso para qué
              sirve?». Se enseña aunque el sistema esté apagado —lo está por defecto—
              pero entonces se dice, en vez de prometer un permiso que hoy no se concede. */}
          {(escala.capabilities ?? []).length > 0 && (
            <Apartado titulo={t('gamePage.unlocks')}>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {escala.capabilities.map((c) => (
                  <Typography component="li" variant="body2" key={c.key} sx={{ mb: 0.5 }}>
                    <strong>{t(`game.level.${c.level}`)}</strong>{' '}
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      ({t('badges.fromGotes', { n: n(c.gotes) })})
                    </Box>{' '}
                    — {t(`game.can.${c.key}`)}
                    {/* Por capacidad y no global: desde que unas piden puntos definitivos
                        y otras no, un único «inactivo» al pie mentía en la mitad. */}
                    {c.enabled === false && (
                      <Box component="span" sx={{ color: 'text.disabled' }}> · {t('gamePage.notYet')}</Box>
                    )}
                  </Typography>
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('gamePage.unlocksAlso', { n: n(escala.capabilityActiveDays) })}
              </Typography>
              {!escala.capabilitiesEnabled && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                  {t('gamePage.unlocksOff')}
                </Typography>
              )}
            </Apartado>
          )}

          {/* Las familias. Sin sesión no hay progreso, así que es catálogo: qué existe y
              qué cuesta. El umbral que se enseña es el PRIMERO — el que decide si la
              tienes o no; los otros dos solo cambian el color del aro. */}
          {familias.length > 0 && (
          <Apartado titulo={t('gamePage.badges')}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t('gamePage.badgesLead')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
              }}
            >
              {familias.map((f) => {
                const explicacion = t(`game.badgeAbout.${f.key}`)
                return (
                  <Box key={f.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Abrible
                      puede
                      nombre={t(`game.badge.${f.key}`)}
                      onOpen={() => setMirando({
                        kind: 'badge', key: f.key,
                        subtitle: grados(f),
                      })}
                    >
                      {BADGE_ART.has(f.key)
                        ? <BadgeArt family={f.key} size={44} />
                        : <BadgeIcon family={f.key} sx={{ fontSize: 34, color: 'text.secondary' }} />}
                    </Abrible>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                        {t(`game.badge.${f.key}`)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                        {/* `t()` devuelve la clave cuando falta la traducción: mejor la
                            línea de umbrales sola que `game.badgeAbout.loQueSea`. */}
                        {explicacion === `game.badgeAbout.${f.key}` ? null : explicacion}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {grados(f)}
                      </Typography>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Apartado>
          )}

          <Divider sx={{ my: 3 }} />

          {/* El baremo, el mismo texto que el (?) del perfil. */}
          <ExplicacionBaremo escala={escala} />

          <Divider sx={{ my: 3 }} />

          {/* La salida. Explicar el juego y no decir por dónde se empieza sería dejar a
              medias justo a quien ha leído hasta el final. */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
            {user ? (
              <>
                <Button component={RouterLink} to="/me/badges" variant="contained" disableElevation>
                  {t('gamePage.myBadges')}
                </Button>
                <Button component={RouterLink} to="/" startIcon={<WaterDropOutlinedIcon />}>
                  {t('gamePage.toMap')}
                </Button>
              </>
            ) : (
              <>
                <Button component={RouterLink} to="/register" variant="contained" disableElevation>
                  {t('gamePage.signUp')}
                </Button>
                <Button component={RouterLink} to="/" startIcon={<WaterDropOutlinedIcon />}>
                  {t('gamePage.toMap')}
                </Button>
              </>
            )}
            <Chip
              size="small"
              variant="outlined"
              label={t('gamePage.optOut')}
              sx={{ ml: { sm: 'auto' } }}
            />
          </Box>
        </>
      )}

      <BadgeShowcase
        open={!!mirando}
        onClose={() => setMirando(null)}
        kind={mirando?.kind ?? 'badge'}
        badgeKey={mirando?.key ?? ''}
        subtitle={mirando?.subtitle}
      />
    </Box>
  )
}
