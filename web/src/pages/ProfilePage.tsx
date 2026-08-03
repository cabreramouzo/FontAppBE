import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ShieldIcon from '@mui/icons-material/GppMaybeOutlined'
import type { Font, MyComment } from '../api/types'
import { deleteAccount, describeError, getMyComments, getMyFonts, updateProfile } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'

export function ProfilePage() {
  const { user, loading, logout, refresh } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      navigate('/login')
      return
    }
    getMyFonts().then(setFonts).catch(() => setFonts([]))
    getMyComments().then(setComments).catch(() => setComments([]))
  }, [user, loading, navigate])

  async function toggleEmailPublic(next: boolean) {
    if (!user) return
    setSavingPrivacy(true)
    try {
      await updateProfile(user.id, { name: user.name, username: user.username, email: user.email ?? '', emailPublic: next })
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

      {user.isAdmin && (
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

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.account')}</Typography>
        <Typography><strong>{user.name}</strong> · @{user.username}</Typography>
        {user.email && <Typography color="text.secondary">{t('profile.email')}: {user.email}</Typography>}
        {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
        <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={removeAccount} sx={{ mt: 1 }}>
          {t('profile.deleteAccount')}
        </Button>
      </Box>

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('privacy.title')}</Typography>
        <FormControlLabel
          control={<Switch checked={!!user.emailPublic} disabled={savingPrivacy} onChange={(e) => toggleEmailPublic(e.target.checked)} />}
          label={t('privacy.emailPublic')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('privacy.emailPublicHint')}
        </Typography>
        <Link component={RouterLink} to={`/users/${encodeURIComponent(user.username)}`} sx={{ display: 'inline-block', mt: 1 }}>
          {t('privacy.viewPublic')}
        </Link>
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
