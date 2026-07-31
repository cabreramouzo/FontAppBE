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
import IconButton from '@mui/material/IconButton'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import type { Flag, Font, MyComment } from '../api/types'
import { assetUrl, deleteAccount, describeError, dismissFlag, getFlags, getMyComments, getMyFonts } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'

export function ProfilePage() {
  const { user, loading, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)
  const [flags, setFlags] = useState<Flag[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      navigate('/login')
      return
    }
    getMyFonts().then(setFonts).catch(() => setFonts([]))
    getMyComments().then(setComments).catch(() => setComments([]))
    if (user.isAdmin) getFlags().then(setFlags).catch(() => setFlags([]))
  }, [user, loading, navigate])

  async function removeFlag(id: string) {
    await dismissFlag(id).catch(() => {})
    setFlags((fs) => fs?.filter((f) => f.id !== id) ?? null)
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

      {user.isAdmin && (
        <Box component="section" sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>🛡️ {t('admin.flags')}</Typography>
          {flags === null && <Skeleton lines={2} />}
          {flags?.length === 0 && <Typography color="text.secondary">{t('admin.noFlags')}</Typography>}
          <List disablePadding>
            {flags?.map((fl) => (
              <ListItem
                key={fl.id}
                divider
                disableGutters
                secondaryAction={
                  <IconButton edge="end" size="small" onClick={() => removeFlag(fl.id)} aria-label={t('admin.dismiss')} title={t('admin.dismiss')}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  slotProps={{ primary: { component: 'div' } }}
                  primary={
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip size="small" label={fl.targetType} />
                        <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', color: 'text.secondary' }}>{fl.targetID}</Typography>
                        {(fl.fontID ?? (fl.targetType === 'font' ? fl.targetID : null)) && (
                          <Link component={RouterLink} to={`/fonts/${fl.fontID ?? fl.targetID}`}>{t('admin.viewTarget')}</Link>
                        )}
                      </Box>
                      {fl.targetText != null && <Typography variant="body2" sx={{ mt: 0.5 }}>“{fl.targetText}”</Typography>}
                      {fl.targetImage && <Box component="img" src={assetUrl(fl.targetImage)} alt="" sx={{ maxHeight: 90, borderRadius: 1, mt: 0.5, display: 'block' }} />}
                      <Typography variant="caption" color="text.secondary">{`${fl.reason ?? ''} · ${fl.flaggerName ?? '—'} · ${fl.createdAt ? timeAgo(fl.createdAt, t) : ''}`}</Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  )
}
