import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import SettingsIcon from '@mui/icons-material/SettingsOutlined'
import ShieldIcon from '@mui/icons-material/GppMaybeOutlined'
import type { Font, MyComment } from '../api/types'
import { getMyComments, getMyFavorites, getMyFonts } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'
import { canModerate } from '../lib/roles'
import { GamificationCard } from '../components/GamificationCard'
import { GuardedFonts } from '../components/GuardedFonts'

/**
 * Tu perfil: **lo tuyo**, y nada de lo que se toca.
 *
 * Los ajustes viven en `/me/settings` desde que se partió esta pantalla. Antes salían
 * aquí en TRES islas separadas por contenido —privacidad y avisos arriba, el interruptor
 * del nivel en medio, la zona de peligro al final— y esa alternancia, no la cantidad de
 * información, es lo que se leía como caos. Medido con una cuenta con datos de verdad
 * (21 favoritas, 12 fuentes, 8 reseñas): 4.082 px en escritorio y 4.749 en móvil, y las
 * favoritas no empezaban hasta 1.458 y 1.613 px respectivamente. O sea, dos pantallas de
 * interruptores por delante de aquello a lo que vienes.
 *
 * La regla del reparto es la misma que decide qué baja a la tab bar: **un sitio donde se
 * está frente a una cosa que se hace.**
 */
export function ProfilePage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [favorites, setFavorites] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      window.location.replace('/login')
      return
    }
    getMyFonts().then(setFonts).catch(() => setFonts([]))
    getMyFavorites().then(setFavorites).catch(() => setFavorites([]))
    getMyComments().then(setComments).catch(() => setComments([]))
  }, [user, loading])

  if (loading) return null
  if (!user) return null

  return (
    <Box className="pad profile" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{t('nav.profile')}</Typography>

      <Box
        component="section"
        sx={{ mb: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56, fontSize: 22 }}>{initials(user.name)}</Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{user.name}</Typography>
          <Typography color="text.secondary">@{user.username}</Typography>
          {user.email && <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>}
        </Box>
      </Box>

      {/* La puerta a lo que se toca. Va aquí arriba, pegada a la identidad, porque es lo
          que sustituye a las tres islas de interruptores: si no se ve de entrada, partir
          la pantalla no habría arreglado nada — habría escondido los ajustes. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Button component={RouterLink} to="/me/settings" variant="outlined" startIcon={<SettingsIcon />}>
          {t('settings.title')}
        </Button>
        <Button component={RouterLink} to={`/users/${encodeURIComponent(user.username)}`} variant="outlined">
          {t('privacy.viewPublic')}
        </Button>
        {canModerate(user) && (
          <Button component={RouterLink} to="/admin" variant="outlined" startIcon={<ShieldIcon />}>
            {t('admin.title')}
          </Button>
        )}
      </Box>

      {!user.gamificationOptOut && <GamificationCard />}

      {/* Va después del marcador: es lo accionable de esta pantalla. Y **no** depende de
          `gamificationOptOut` — cuidar una fuente no es puntuar, y quien apagó los puntos
          sigue queriendo saber qué se le está quedando viejo. */}
      <GuardedFonts />

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.myFavorites')}</Typography>
        {favorites === null && <Skeleton lines={2} />}
        {favorites?.length === 0 && <Typography color="text.secondary">{t('profile.noFavorites')}</Typography>}
        <List disablePadding>
          {favorites?.map((f) => (
            <ListItem key={f.id} disablePadding divider>
              <ListItemButton component={RouterLink} to={`/fonts/${f.id}`}>
                <ListItemText primary={f.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.myFonts')}</Typography>
        {fonts === null && <Skeleton lines={2} />}
        {fonts?.length === 0 && <Typography color="text.secondary">{t('profile.noFonts')}</Typography>}
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
        <Typography variant="h6" gutterBottom>{t('profile.myReviews')}</Typography>
        {comments === null && <Skeleton lines={3} />}
        {comments?.length === 0 && <Typography color="text.secondary">{t('profile.noReviews')}</Typography>}
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
    </Box>
  )
}

/// Iniciales para el avatar: primeras letras de las dos primeras palabras.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
