import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Alert from '@mui/material/Alert'
import LinearProgress from '@mui/material/LinearProgress'
import Button from '@mui/material/Button'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useTheme } from '@mui/material/styles'
import { getGamification } from '../api/client'
import type { GamificationProfile } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { Skeleton } from '../components/Skeleton'
import { LevelBadge, APAGADA } from '../components/LevelBadge'
import { BadgeIcon } from '../components/BadgeIcon'
import { TIER_COLOR } from '../lib/tierColors'

/**
 * La vitrina: todo lo que se puede conseguir, conseguido o no.
 *
 * Lo que **no** hace es esconder lo que falta. Una vitrina que solo enseña lo ganado no
 * dice a dónde vas, y aquí lo que hay que enseñar es precisamente el camino: casi todo
 * el mundo va a llegar con dos casillas de diez. Por eso las bloqueadas van en silueta
 * gris pero **con su progreso al lado** — «3 de 5» invita y «bloqueada» no.
 *
 * Es una página aparte y no un bloque más en `/me` a propósito: el perfil abre con el
 * impacto sobre el mapa, y una rejilla de trofeos ahí arriba desplaza justo lo que
 * queremos que se lea primero. Quien quiera la colección, la va a buscar.
 */
export function BadgesPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const modo = useTheme().palette.mode === 'dark' ? 'dark' : 'light'
  const tier = TIER_COLOR[modo]
  const [data, setData] = useState<GamificationProfile | null>(null)
  const [estado, setEstado] = useState<'loading' | 'ok' | 'off' | 'error'>('loading')

  useEffect(() => { document.title = `${t('badges.title')} · FontApp` }, [t])

  useEffect(() => {
    getGamification()
      .then((p) => {
        // 204 → el usuario apagó la gamificación. No es un error: es que no hay
        // vitrina que enseñar, y decirlo con su interruptor al lado es más útil que
        // una página vacía.
        if (!p) { setEstado('off'); return }
        setData(p)
        setEstado('ok')
      })
      .catch(() => setEstado('error'))
  }, [])

  if (!user) return <Alert severity="info" sx={{ m: 2 }}>{t('badges.needLogin')}</Alert>

  return (
    <Box className="pad" sx={{ maxWidth: 900, mx: 'auto' }}>
      <Button component={RouterLink} to="/me" size="small" startIcon={<ArrowBackIcon />} sx={{ textTransform: 'none' }}>
        {t('nav.profile')}
      </Button>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>🏅 {t('badges.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{t('badges.intro')}</Typography>

      {estado === 'loading' && <Skeleton lines={8} />}
      {estado === 'error' && <Alert severity="warning">{t('badges.failed')}</Alert>}
      {estado === 'off' && (
        <Alert severity="info" action={<Button component={RouterLink} to="/me" size="small">{t('nav.profile')}</Button>}>
          {t('badges.hidden')}
        </Alert>
      )}

      {estado === 'ok' && data && (
        <>
          <Seccion titulo={t('badges.levels')} pie={t('badges.levelsHint')}>
            {data.levels.map((n) => (
              <Casilla key={n.key} destacada={n.current}>
                <LevelBadge levelKey={n.key} size={88} locked={!n.reached} placeholder />
                <Rotulo
                  nombre={t(`game.level.${n.key}`)}
                  apagado={!n.reached}
                  detalle={n.from === 0 ? t('badges.start') : t('badges.fromGotes', { n: n.from.toLocaleString(lang) })}
                  insignia={n.current ? <Chip size="small" color="primary" label={t('badges.current')} sx={{ fontWeight: 700, height: 20 }} /> : null}
                />
              </Casilla>
            ))}
          </Seccion>

          <Seccion titulo={t('badges.families')} pie={t('badges.familiesHint')}>
            {data.collection.map((b) => {
              const conseguida = b.tier != null
              const color = conseguida ? tier[b.tier as string] ?? 'text.primary' : 'text.disabled'
              // Al máximo, `progress` ya pasó del último umbral y la barra debe ir llena.
              const pct = Math.max(0, Math.min(100, (b.progress / b.threshold) * 100))
              const tope = b.progress >= b.thresholds[b.thresholds.length - 1]
              return (
                <Casilla key={b.family}>
                  <Box
                    sx={{
                      width: 88, height: 88, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', position: 'relative',
                      bgcolor: 'action.hover',
                      border: '2px solid', borderColor: conseguida ? color : 'divider',
                      color,
                      ...(conseguida ? null : APAGADA),
                    }}
                  >
                    <BadgeIcon family={b.family} sx={{ fontSize: 40 }} />
                    {!conseguida && (
                      <LockOutlinedIcon
                        sx={{ position: 'absolute', bottom: 6, right: 6, fontSize: 16, color: 'text.disabled' }}
                      />
                    )}
                  </Box>
                  <Rotulo
                    nombre={t(`game.badge.${b.family}`)}
                    apagado={!conseguida}
                    detalle={tope
                      ? t('badges.maxed')
                      : t('badges.progress', { n: String(b.progress), m: String(b.threshold) })}
                    insignia={conseguida
                      ? <Chip size="small" variant="outlined" label={t(`game.tier.${b.tier}`)}
                              sx={{ fontWeight: 700, height: 20, color, borderColor: color }} />
                      : null}
                  />
                  {!tope && (
                    <Tooltip title={t('badges.progress', { n: String(b.progress), m: String(b.threshold) })}>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          width: '100%', height: 5, borderRadius: 3, mt: 0.75,
                          // Mismo motivo que en las barras de zona: el carril por defecto
                          // es un azul saturado y una barra casi vacía se lee como llena.
                          bgcolor: 'action.selected',
                          '& .MuiLinearProgress-bar': { borderRadius: 3 },
                        }}
                      />
                    </Tooltip>
                  )}
                </Casilla>
              )
            })}
          </Seccion>
        </>
      )}
    </Box>
  )
}

function Seccion({ titulo, pie, children }: { titulo: string; pie: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>{titulo}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{pie}</Typography>
      {/* `auto-fill` y no `auto-fit`: con pocas casillas, `auto-fit` las estira hasta
          ocupar toda la fila y una insignia suelta salía del tamaño de una tarjeta. */}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {children}
      </Box>
    </Box>
  )
}

function Casilla({ destacada, children }: { destacada?: boolean; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        p: 1.5, borderRadius: 2,
        border: '1px solid', borderColor: destacada ? 'primary.main' : 'divider',
        bgcolor: destacada ? 'action.hover' : 'transparent',
      }}
    >
      {children}
    </Box>
  )
}

function Rotulo({ nombre, detalle, apagado, insignia }: {
  nombre: string
  detalle: string
  apagado: boolean
  insignia: React.ReactNode
}) {
  return (
    <>
      {/* El nombre NO se apaga aunque la casilla esté bloqueada: saber a qué aspiras es
          justamente lo que hace que una silueta gris sirva de algo. Lo que se apaga es
          el dibujo. */}
      <Typography variant="body2" sx={{ fontWeight: 700, mt: 1, lineHeight: 1.25 }}>{nombre}</Typography>
      <Typography variant="caption" color={apagado ? 'text.disabled' : 'text.secondary'} sx={{ lineHeight: 1.3 }}>
        {detalle}
      </Typography>
      {insignia && <Box sx={{ mt: 0.5 }}>{insignia}</Box>}
    </>
  )
}
