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
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import type { Feedback, Flag, FontEdit, InterestStats, RegionStat, StaffMember, UserRole } from '../api/types'
import { assetUrl, describeError, dismissFlag, getFeedback, getFlags, getFontEdits, getInterestStats, getRegionStats, getStaff, reviewFontEdit, revertFontEdit, setUserRole } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { EditsTable } from '../components/EditsTable'
import { timeAgo } from '../lib/time'
import { canModerate, isAdminRole, isOwner } from '../lib/roles'

// Cuántas ediciones pendientes se muestran en el panel (la cola). El resto, en /admin/edits.
const EDITS_INBOX = 15

export function AdminPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [flags, setFlags] = useState<Flag[] | null>(null)
  const [edits, setEdits] = useState<FontEdit[] | null>(null)
  const [regions, setRegions] = useState<RegionStat[] | null>(null)
  const [interest, setInterest] = useState<InterestStats | null>(null)
  const [feedback, setFeedback] = useState<Feedback[] | null>(null)
  const [staff, setStaff] = useState<StaffMember[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!canModerate(user)) {
      navigate('/') // moderador o superior; el resto fuera
      return
    }
    // Moderación (moderador+): denuncias.
    getFlags().then(setFlags).catch(() => setFlags([]))
    // Estadísticas y gestión de fuentes (admin+).
    if (isAdminRole(user)) {
      getFontEdits(1, { unreviewed: true, per: EDITS_INBOX }).then(setEdits).catch(() => setEdits([]))
      getRegionStats().then(setRegions).catch(() => setRegions([]))
      getInterestStats().then(setInterest).catch(() => setInterest(null))
      getFeedback().then(setFeedback).catch(() => setFeedback([]))
    }
    // Gestión de roles (solo owner).
    if (isOwner(user)) getStaff().then(setStaff).catch(() => setStaff([]))
  }, [user, loading, navigate])

  async function changeRole(id: string, role: UserRole) {
    try {
      await setUserRole(id, role)
      setStaff((s) => (s ?? []).map((m) => (m.id === id ? { ...m, role } : m)).filter((m) => m.role !== 'user'))
    } catch (e) {
      setError(describeError(e, t))
    }
  }


  async function removeFlag(id: string) {
    await dismissFlag(id).catch(() => {})
    setFlags((fs) => fs?.filter((f) => f.id !== id) ?? null)
  }

  // ✓ Aceptar: marca la edición como revisada y la saca de la cola (solo triaje).
  async function accept(editID: string) {
    try {
      await reviewFontEdit(editID)
      setEdits((es) => es?.filter((e) => e.id !== editID) ?? null)
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  async function revert(editID: string) {
    if (!confirm(t('admin.confirmRevert'))) return
    try {
      await revertFontEdit(editID)
      // Recarga la cola pendiente (el revert añade una entrada nueva).
      getFontEdits(1, { unreviewed: true, per: EDITS_INBOX }).then(setEdits).catch(() => {})
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (!canModerate(user)) return null

  return (
    <Box className="pad" sx={{ maxWidth: 1040, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>🛠️ {t('admin.title')}</Typography>
      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}

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

      {isOwner(user) && (
        <Box component="section" sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>👑 {t('admin.roles')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('admin.rolesIntro')}</Typography>
          {staff === null && <Skeleton lines={2} />}
          {staff?.length === 0 && <Typography color="text.secondary">{t('admin.rolesEmpty')}</Typography>}
          <List disablePadding>
            {staff?.map((m) => (
              <ListItem key={m.id} divider disableGutters
                secondaryAction={
                  m.role === 'owner' ? (
                    <Chip size="small" label={t('role.owner')} color={m.id === user?.id ? 'primary' : 'default'} />
                  ) : (
                    <Select
                      size="small"
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value as UserRole)}
                      sx={{ minWidth: 140 }}
                    >
                      <MenuItem value="user">{t('role.user')}</MenuItem>
                      <MenuItem value="moderator">{t('role.moderator')}</MenuItem>
                      <MenuItem value="admin">{t('role.admin')}</MenuItem>
                    </Select>
                  )
                }
              >
                <ListItemText
                  primary={<Link component={RouterLink} to={`/users/${encodeURIComponent(m.username)}`}>@{m.username}</Link>}
                  slotProps={{ primary: { component: 'div' } }}
                />
              </ListItem>
            ))}
          </List>
          <Button component={RouterLink} to="/admin/users" variant="outlined" sx={{ mt: 1.5 }}>{t('admin.manageUsers')}</Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{t('admin.rolesHint')}</Typography>
        </Box>
      )}

      {isAdminRole(user) && (<>
      <Box component="section" sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>🌍 {t('admin.regions')}</Typography>
        {regions === null && <Skeleton lines={2} />}
        {regions?.length === 0 && <Typography color="text.secondary">{t('admin.noRegions')}</Typography>}
        <List disablePadding>
          {regions?.map((r, i) => (
            <ListItem key={i} divider disableGutters secondaryAction={<Typography variant="body2" sx={{ fontWeight: 700 }}>{r.count}</Typography>}>
              <ListItemText
                primary={r.region ?? t('admin.regionUnknown')}
                secondary={r.country ?? undefined}
              />
            </ListItem>
          ))}
        </List>
      </Box>

      <Box component="section" sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>📱 {t('admin.appWish')}</Typography>
        {interest === null && <Skeleton lines={2} />}
        {interest && interest.total === 0 && <Typography color="text.secondary">{t('admin.appWishNone')}</Typography>}
        {interest && interest.total > 0 && (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              <Chip color="success" label={`👍 ${t('appWish.yes')}: ${interest.yes}`} />
              <Chip label={`👎 ${t('appWish.no')}: ${interest.no}`} />
              <Chip variant="outlined" label={`${t('admin.appWishTotal')}: ${interest.total}`} />
            </Box>
            {interest.voters.length > 0 && (
              <List disablePadding>
                {interest.voters.map((v, i) => (
                  <ListItem key={i} divider disableGutters
                    secondaryAction={<Chip size="small" color={v.wants ? 'success' : 'default'} label={v.wants ? t('appWish.yes') : t('appWish.no')} />}>
                    <ListItemText
                      primary={<Link component={RouterLink} to={`/users/${encodeURIComponent(v.username)}`}>@{v.username}</Link>}
                      secondary={`${v.platform ?? '—'}${v.at ? ' · ' + timeAgo(v.at, t) : ''}`}
                      slotProps={{ primary: { component: 'div' } }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </Box>

      <Box component="section" sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>💬 {t('admin.feedback')}</Typography>
        {feedback === null && <Skeleton lines={2} />}
        {feedback?.length === 0 && <Typography color="text.secondary">{t('admin.feedbackNone')}</Typography>}
        <List disablePadding>
          {feedback?.map((f) => (
            <ListItem key={f.id} divider disableGutters alignItems="flex-start">
              <ListItemText
                slotProps={{ primary: { component: 'div' } }}
                primary={<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{f.message}</Typography>}
                secondary={
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                    {f.country && <Chip size="small" label={`🌍 ${f.country}`} />}
                    {f.email && <Chip size="small" variant="outlined" label={f.email} />}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {(f.username ? `@${f.username}` : t('admin.feedbackAnon'))}{f.createdAt ? ` · ${timeAgo(f.createdAt, t)}` : ''}
                    </Typography>
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      </Box>

      <Box component="section" sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6" gutterBottom>✏️ {t('admin.edits')}</Typography>
          <Link component={RouterLink} to="/admin/edits">{t('admin.editsAll')}</Link>
        </Box>
        {edits === null && <Skeleton lines={2} />}
        {edits?.length === 0 && <Typography color="text.secondary">{t('admin.editsInboxEmpty')}</Typography>}
        {edits && edits.length > 0 && (
          <>
            <EditsTable edits={edits} onRevert={revert} onAccept={accept} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{t('admin.editsInboxHint')}</Typography>
          </>
        )}
      </Box>
      </>)}
    </Box>
  )
}
