import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { BadgeArt } from './BadgeArt'
import { LevelBadge } from './LevelBadge'
import { BadgeIcon } from './BadgeIcon'
import { Confetti } from './Confetti'
import { buscarNovedades, buscarNovedadesTrasAportar } from '../lib/badgeCelebration'
import type { Novedad } from '../lib/badgeCelebration'
import { BADGE_ART } from '../lib/levelBadges'
import { TIER_COLOR } from '../lib/tierColors'

/** Un respiro antes de la fiesta: si sale a la vez que carga la pantalla, se pisan. */
const ESPERA = 2500

/**
 * «Gracias por contribuir, acabas de ganar Pionero» — con confeti.
 *
 * Se comprueba una vez por sesión, al arrancar y solo con sesión iniciada. No después de
 * publicar una reseña, aunque sea ahí donde apetecería: las insignias cuentan solo
 * aportaciones **liquidadas**, y eso son 72 h. Enseñarla al publicar y retirarla dos días
 * después porque la reseña se anuló sería una promesa rota; ver `lib/badgeCelebration`.
 *
 * Solo se pide con buena conexión. Es una floritura y no gasta los datos de nadie.
 *
 * No se pinta nada si el usuario apagó la gamificación: el endpoint devuelve la lista
 * vacía en ese caso, así que no hay nada que celebrar y no hay que comprobarlo aquí.
 */
export function BadgeCelebration() {
  const { t } = useI18n()
  const { user } = useAuth()
  const modo = useTheme().palette.mode === 'dark' ? 'dark' : 'light'
  const [novedad, setNovedad] = useState<Novedad | null>(null)

  // La dependencia es el identificador y no el objeto: `AuthContext` rehace el usuario
  // al refrescar la sesión, y con el objeto esto se dispararía otra vez sin que haya
  // cambiado nada.
  const userID = user?.id
  useEffect(() => {
    if (!userID) return
    let vivo = true

    // Al arrancar: por si la ganaste en otro sitio o en otra sesión.
    const id = window.setTimeout(() => {
      buscarNovedades().then((n) => { if (vivo && n) setNovedad(n) }).catch(() => {})
    }, ESPERA)

    // Y justo después de aportar, que es para lo que sirve esto: la felicitación llega
    // mientras todavía tienes la fuente delante.
    function alAportar() {
      buscarNovedadesTrasAportar().then((n) => { if (vivo && n) setNovedad(n) }).catch(() => {})
    }
    window.addEventListener('fontapp:contributed', alAportar)

    return () => {
      vivo = false
      window.clearTimeout(id)
      window.removeEventListener('fontapp:contributed', alAportar)
    }
  }, [userID])

  if (!novedad) return null
  const { badge, level, otras } = novedad
  // Dos celebraciones con la misma cara: subir de nivel y ganar una insignia. Comparten
  // diálogo a propósito — la fiesta es la misma y así el gesto se reconoce.
  const esNivel = level != null
  const nombre = esNivel ? t(`game.level.${level}`) : t(`game.badge.${badge!.family}`)
  const aro = !esNivel && badge!.tier !== 'unique' ? TIER_COLOR[modo][badge!.tier] : null

  return (
    <>
      <Confetti activo />
      <Dialog
        open
        onClose={() => setNovedad(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 3, textAlign: 'center', p: 3, backgroundImage: 'none' } },
          backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.72)' } },
        }}
      >
        <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1.5 }}>
          {t(esNivel ? 'celebrate.levelUp' : 'celebrate.eyebrow')}
        </Typography>

        <Box
          sx={{
            display: 'flex', justifyContent: 'center', my: 2,
            // La misma entrada del visor a pantalla completa: aparece pequeña y girada y
            // se asienta. Reutilizada a posta — que el gesto de «una medalla» sea siempre
            // el mismo es lo que lo hace reconocible.
            '& > *': { animation: 'fontapp-badge-in 620ms cubic-bezier(.2,.8,.3,1)' },
            '@media (prefers-reduced-motion: reduce)': { '& > *': { animation: 'none' } },
          }}
        >
          {/* El aro del grado lo pone `BadgeArt` cuando hay dibujo; ponerlo también aquí
              daba dos anillos concéntricos. Solo lo dibuja este envoltorio cuando la
              familia va con icono y no tiene aro propio. */}
          {esNivel ? (
            <Box sx={{ display: 'flex' }}>
              <LevelBadge levelKey={level} size={160} placeholder />
            </Box>
          ) : BADGE_ART.has(badge!.family) ? (
            <Box sx={{ display: 'flex', ...(aro && { borderRadius: '50%', boxShadow: `0 0 26px ${aro}55` }) }}>
              <BadgeArt family={badge!.family} size={150} tier={badge!.tier} />
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex', borderRadius: '50%',
                ...(aro && { p: '10px', border: '3px solid', borderColor: aro, boxShadow: `0 0 26px ${aro}55` }),
              }}
            >
              <BadgeIcon family={badge!.family} sx={{ fontSize: 110, color: aro ?? 'primary.main' }} />
            </Box>
          )}
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 800 }}>{nombre}</Typography>
        {!esNivel && badge!.tier !== 'unique' && (
          <Chip
            size="small"
            variant="outlined"
            label={t(`game.tier.${badge!.tier}`)}
            sx={{ mt: 1, fontWeight: 700, color: aro ?? undefined, borderColor: aro ?? undefined }}
          />
        )}

        <Typography color="text.secondary" sx={{ mt: 2 }}>{t('celebrate.thanks')}</Typography>
        {/* Por qué te la han dado. Es la pregunta que sigue a «¡la tienes!», y sin
            responderla el premio parece que sale de la nada. */}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {(() => {
            const clave = esNivel ? 'game.levelAbout' : `game.badgeAbout.${badge!.family}`
            const texto = t(clave)
            return texto === clave ? null : texto
          })()}
        </Typography>
        {otras > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontWeight: 700 }}>
            {t(esNivel ? 'celebrate.andBadges' : 'celebrate.andMore', { n: String(otras) })}
          </Typography>
        )}

        {/* La única letra pequeña, y hace falta: la felicitación va por delante de las
            72 h de liquidación, así que durante tres días la vitrina todavía la enseña
            como pendiente. Decirlo aquí cuesta una línea; no decirlo parece un fallo. */}
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
          {t('celebrate.pending')}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" disableElevation onClick={() => setNovedad(null)}>
            {t('celebrate.nice')}
          </Button>
          <Button component={RouterLink} to="/me/badges" onClick={() => setNovedad(null)}>
            {t('celebrate.seeAll')}
          </Button>
        </Box>
      </Dialog>
    </>
  )
}
