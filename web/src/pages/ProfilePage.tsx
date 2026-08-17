import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import Divider from '@mui/material/Divider'
import Collapse from '@mui/material/Collapse'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ShieldIcon from '@mui/icons-material/GppMaybeOutlined'
import type { Font, MyComment } from '../api/types'
import { deleteAccount, describeError, getMyComments, getMyFavorites, getMyFonts, updateProfile } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'
import { canModerate } from '../lib/roles'
import { GamificationCard } from '../components/GamificationCard'
import { capabilitiesEnabled } from '../lib/capabilities'

export function ProfilePage() {
  const { user, loading, logout, refresh } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [favorites, setFavorites] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [dangerOpen, setDangerOpen] = useState(false)
  const [error, setError] = useState('')
  // Si los niveles no conceden nada (el sistema nace apagado), no se avisa de que
  // apagarlos te quita permisos: sería amenazar con algo que no existe.
  const [capsOn, setCapsOn] = useState(false)

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      window.location.replace('/login')
      return
    }
    getMyFonts().then(setFonts).catch(() => setFonts([]))
    getMyFavorites().then(setFavorites).catch(() => setFavorites([]))
    getMyComments().then(setComments).catch(() => setComments([]))
    capabilitiesEnabled().then(setCapsOn)
  }, [user, loading, navigate])

  async function savePrivacy(patch: { emailPublic?: boolean; namePublic?: boolean; weeklyDigest?: boolean; gamificationOptOut?: boolean }) {
    if (!user) return
    setSavingPrivacy(true)
    try {
      await updateProfile(user.id, {
        name: user.name,
        username: user.username,
        email: user.email ?? '',
        emailPublic: user.emailPublic ?? false,
        namePublic: user.namePublic ?? true,
        weeklyDigest: user.weeklyDigest ?? true,
        gamificationOptOut: user.gamificationOptOut ?? false,
        ...patch,
      })
      await refresh() // refresca el usuario para reflejar el nuevo estado
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setSavingPrivacy(false)
    }
  }

  async function removeAccount() {
    if (!user || !confirm(t('profile.confirmDelete'))) return
    try {
      await deleteAccount(user.id)
      await logout()
      navigate('/')
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (!user) return null

  return (
    <Box className="pad profile" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{t('nav.profile')}</Typography>

      {canModerate(user) && (
        <Button
          component={RouterLink}
          to="/admin"
          variant="outlined"
          startIcon={<ShieldIcon />}
          sx={{ mb: 2 }}
        >
          {t('admin.title')}
        </Button>
      )}

      <Box
        component="section"
        sx={{ mb: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56, fontSize: 22 }}>{initials(user.name)}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{user.name}</Typography>
          <Typography color="text.secondary">@{user.username}</Typography>
          {user.email && <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('privacy.title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('privacy.intro')}
        </Typography>
        <FormControlLabel
          control={<Switch checked={user.namePublic ?? true} disabled={savingPrivacy} onChange={(e) => savePrivacy({ namePublic: e.target.checked })} />}
          label={t('privacy.namePublic')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {t('privacy.namePublicHint')}
        </Typography>
        <FormControlLabel
          control={<Switch checked={!!user.emailPublic} disabled={savingPrivacy} onChange={(e) => savePrivacy({ emailPublic: e.target.checked })} />}
          label={t('privacy.emailPublic')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('privacy.emailPublicHint')}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <Link component={RouterLink} to={`/users/${encodeURIComponent(user.username)}`}>
            {t('privacy.viewPublic')}
          </Link>
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('notif.title')}</Typography>
        <FormControlLabel
          control={<Switch checked={user.weeklyDigest ?? true} disabled={savingPrivacy} onChange={(e) => savePrivacy({ weeklyDigest: e.target.checked })} />}
          label={t('notif.weekly')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('notif.weeklyHint')}
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {!user.gamificationOptOut && <GamificationCard />}

      {/* El interruptor va DESPUÉS del marcador: "ocultar las gotas" antes de haber visto
          ninguna no significa nada. Y queda fuera de la tarjeta a propósito, para que
          apagarla no esconda también la forma de volver a encenderla. */}
      <Box component="section" sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={user.gamificationOptOut ?? false}
              disabled={savingPrivacy}
              onChange={(e) => savePrivacy({ gamificationOptOut: e.target.checked })}
            />
          }
          label={t('game.optOut')}
        />
        {/* Tres frases y no una porque el interruptor hace tres cosas distintas, y la
            que decía «solo dejas de ver el marcador» era falsa: también te borra de lo
            que ven los demás y, si los permisos están activos, te los quita. Quien
            apaga esto está tomando una decisión sobre su privacidad y necesita saber
            qué sigue siendo público —sus fuentes y reseñas lo son— y qué no. */}
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, color: 'text.secondary' }}>
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {t('game.optOutKeeps')}
          </Typography>
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {t('game.optOutHidesOthers')}
          </Typography>
          {capsOn && (
            <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
              {t('game.optOutCaps')}
            </Typography>
          )}
        </Box>
      </Box>

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

      <Divider sx={{ my: 3 }} />
      <Box component="section" sx={{ mb: 2, border: 1, borderColor: 'error.main', borderRadius: 2, overflow: 'hidden' }}>
        <Button
          fullWidth
          color="error"
          onClick={() => setDangerOpen((o) => !o)}
          startIcon={<WarningAmberIcon />}
          endIcon={<ExpandMoreIcon sx={{ transform: dangerOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
          sx={{ justifyContent: 'space-between', px: 2, py: 1.25, textTransform: 'none', fontWeight: 700 }}
        >
          {t('profile.dangerZone')}
        </Button>
        <Collapse in={dangerOpen}>
          <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t('profile.dangerZoneHint')}
            </Typography>
            <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={removeAccount}>
              {t('profile.deleteAccount')}
            </Button>
          </Box>
        </Collapse>
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
