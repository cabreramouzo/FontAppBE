import { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import type { Font, MyComment, UserResponse } from '../api/types'
import { getUser, getUserComments, getUserFonts } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { timeAgo } from '../lib/time'

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [user, setUser] = useState<UserResponse | null>(null)
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    getUser(id).then(setUser).catch(() => setNotFound(true))
    getUserFonts(id).then(setFonts).catch(() => setFonts([]))
    getUserComments(id).then(setComments).catch(() => setComments([]))
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
          <>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{user.name}</Typography>
            <Typography color="text.secondary">
              @{user.username}
              {user.createdAt && ` · ${t('user.memberSince', { when: timeAgo(user.createdAt, t) })}`}
            </Typography>
            {user.email && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {t('user.contact')}: <Link href={`mailto:${user.email}`}>{user.email}</Link>
              </Typography>
            )}
          </>
        )}
      </Box>

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
    </Box>
  )
}
