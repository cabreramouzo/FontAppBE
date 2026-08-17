import { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import type { Font, MyComment, UserResponse } from '../api/types'
import { getUser, getUserComments, getUserFonts, getUserGamification } from '../api/client'
import type { PublicGamification } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'
import { LevelBadge } from '../components/LevelBadge'
import { BadgeArt } from '../components/BadgeArt'
import { BadgeIcon } from '../components/BadgeIcon'
import { Abrible, BadgeShowcase } from '../components/BadgeShowcase'
import { BADGE_ART } from '../lib/levelBadges'
import { TIER_COLOR } from '../lib/tierColors'
import { useTheme } from '@mui/material/styles'

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [user, setUser] = useState<UserResponse | null>(null)
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [juego, setJuego] = useState<PublicGamification | null>(null)
  const [mirando, setMirando] = useState<{ kind: 'level' | 'badge'; key: string; tier: string | null } | null>(null)
  const modo = useTheme().palette.mode === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!id) return
    getUser(id).then(setUser).catch(() => setNotFound(true))
    getUserFonts(id).then(setFonts).catch(() => setFonts([]))
    getUserComments(id).then(setComments).catch(() => setComments([]))
    getUserGamification(id).then(setJuego).catch(() => setJuego(null))
  }, [id])

  if (notFound) {
    return (
      <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
        <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
        <Typography sx={{ mt: 2 }} color="text.secondary">{t('user.notFound')}</Typography>
      </Box>
    )
  }

  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>

      <Box component="section" sx={{ my: 2 }}>
        {user === null ? (
          <Skeleton lines={2} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 64, height: 64, fontSize: 24 }}>{initials(user.name)}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.15 }}>{user.name}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography color="text.secondary">
                  @{user.username}
                  {user.createdAt && ` · ${t('user.memberSince', { when: timeAgo(user.createdAt, t) })}`}
                </Typography>
                {user.anonymized && <Chip size="small" label={t('user.deleted')} />}
              </Box>
              {user.email && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {t('user.contact')}: <Link href={`mailto:${user.email}`}>{user.email}</Link>
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Nivel e insignias, lo mismo que ve esa persona en su vitrina pero **solo lo
          conseguido**: sin la escalera entera, sin las bloqueadas y sin progresos. Lo
          que falta por ganar es asunto suyo; lo ganado es un hecho sobre el mapa que
          cualquiera puede ver, igual que sus fuentes y sus reseñas.
          Tampoco van las gotas: «Río» dice cuánto ha aportado sin convertir el perfil en
          un contador. Y no se pinta nada si lo tiene apagado desde su perfil — el
          servidor devuelve la lista vacía y el nivel nulo. */}
      {juego && (juego.level || juego.badges.length > 0) && (
        <Box component="section" sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>{t('user.gamification')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
            {/* El nombre debajo del escudo y no al lado: puesto en horizontal quedaba
                entre la chapa y la fila de insignias, y se leía como si fuera el rótulo
                de la primera insignia en vez del nivel. */}
            {juego.level && (
              <Box sx={{ textAlign: 'center' }}>
                <Abrible
                  puede
                  nombre={t(`game.level.${juego.level}`)}
                  onOpen={() => setMirando({ kind: 'level', key: juego.level as string, tier: null })}
                >
                  <LevelBadge levelKey={juego.level} size={56} />
                </Abrible>
                <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  {t(`game.level.${juego.level}`)}
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {juego.badges.map((b) => (
                <Abrible
                  key={b.family}
                  puede
                  nombre={t(`game.badge.${b.family}`)}
                  onOpen={() => setMirando({ kind: 'badge', key: b.family, tier: b.tier })}
                >
                  {BADGE_ART.has(b.family) ? (
                    <BadgeArt family={b.family} size={44} tier={b.tier} />
                  ) : (
                    <Box
                      sx={{
                        width: 44, height: 44, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        bgcolor: 'action.hover', border: '2px solid',
                        borderColor: TIER_COLOR[modo][b.tier] ?? 'divider',
                        color: TIER_COLOR[modo][b.tier] ?? 'text.secondary',
                      }}
                    >
                      <BadgeIcon family={b.family} sx={{ fontSize: 24 }} />
                    </Box>
                  )}
                </Abrible>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('user.fonts', { n: fonts?.length ?? 0 })}</Typography>
        {fonts === null && <Skeleton lines={2} />}
        {fonts?.length === 0 && <Typography color="text.secondary">{t('user.noFonts')}</Typography>}
        <List disablePadding>
          {fonts?.map((f) => (
            <ListItem key={f.id} disablePadding divider>
              <ListItemButton component={RouterLink} to={`/fonts/${f.id}`}>
                <ListItemText primary={f.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box component="section">
        <Typography variant="h6" gutterBottom>{t('user.reviews', { n: comments?.length ?? 0 })}</Typography>
        {comments === null && <Skeleton lines={3} />}
        {comments?.length === 0 && <Typography color="text.secondary">{t('user.noReviews')}</Typography>}
        <List disablePadding>
          {comments?.map((c) => {
            const ws = waterStatusInfo(c.waterStatus)
            return (
              <ListItem key={c.id} divider alignItems="flex-start" sx={{ display: 'block', py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Link component={RouterLink} to={`/fonts/${c.fontID}`} sx={{ fontWeight: 600 }}>{c.fontName ?? '—'}</Link>
                  {ws && <Chip size="small" label={`${ws.emoji} ${t(`status.${ws.key}`)}`} />}
                  <Typography variant="caption" color="text.secondary">· {c.createdAt ? timeAgo(c.createdAt, t) : ''}</Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 0.5 }}>{c.body}</Typography>
              </ListItem>
            )
          })}
        </List>
      </Box>

      <BadgeShowcase
        open={!!mirando}
        onClose={() => setMirando(null)}
        kind={mirando?.kind ?? 'badge'}
        badgeKey={mirando?.key ?? ''}
        tier={mirando?.tier ?? null}
      />
    </Box>
  )
}

/// Iniciales para el avatar: primeras letras de las dos primeras palabras.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
