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
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import UndoIcon from '@mui/icons-material/Undo'
import type { Flag, FontEdit, FontInfoSnapshot, InterestStats, RegionStat } from '../api/types'
import { assetUrl, describeError, dismissFlag, getFlags, getFontEdits, getInterestStats, getRegionStats, revertFontEdit, FONT_EDITS_PER } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { timeAgo } from '../lib/time'

export function AdminPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [flags, setFlags] = useState<Flag[] | null>(null)
  const [edits, setEdits] = useState<FontEdit[] | null>(null)
  const [regions, setRegions] = useState<RegionStat[] | null>(null)
  const [interest, setInterest] = useState<InterestStats | null>(null)
  const [editsPage, setEditsPage] = useState(1)
  const [editsHasMore, setEditsHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user || !user.isAdmin) {
      navigate('/') // solo admins; el resto fuera
      return
    }
    getFlags().then(setFlags).catch(() => setFlags([]))
    getFontEdits(1).then((e) => { setEdits(e); setEditsPage(1); setEditsHasMore(e.length === FONT_EDITS_PER) }).catch(() => setEdits([]))
    getRegionStats().then(setRegions).catch(() => setRegions([]))
    getInterestStats().then(setInterest).catch(() => setInterest(null))
  }, [user, loading, navigate])

  async function loadMoreEdits() {
    setLoadingMore(true)
    try {
      const next = editsPage + 1
      const more = await getFontEdits(next)
      setEdits((cur) => [...(cur ?? []), ...more])
      setEditsPage(next)
      setEditsHasMore(more.length === FONT_EDITS_PER)
    } catch (e) {
      setError(describeError(e, t))
    } finally {
      setLoadingMore(false)
    }
  }

  async function removeFlag(id: string) {
    await dismissFlag(id).catch(() => {})
    setFlags((fs) => fs?.filter((f) => f.id !== id) ?? null)
  }

  async function revert(editID: string) {
    if (!confirm(t('admin.confirmRevert'))) return
    try {
      await revertFontEdit(editID)
      // Recarga desde la primera página (el revert añade una entrada nueva).
      getFontEdits(1).then((e) => { setEdits(e); setEditsPage(1); setEditsHasMore(e.length === FONT_EDITS_PER) }).catch(() => {})
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (!user || !user.isAdmin) return null

  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
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
        <Typography variant="h6" gutterBottom>✏️ {t('admin.edits')}</Typography>
        {edits === null && <Skeleton lines={2} />}
        {edits?.length === 0 && <Typography color="text.secondary">{t('admin.noEdits')}</Typography>}
        {edits && edits.length > 0 && (
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 640, '& td, & th': { verticalAlign: 'top' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.colWhen')}</TableCell>
                  <TableCell>{t('admin.colFont')}</TableCell>
                  <TableCell>{t('admin.colEditor')}</TableCell>
                  <TableCell>{t('admin.colField')}</TableCell>
                  <TableCell>{t('admin.colBefore')}</TableCell>
                  <TableCell>{t('admin.colAfter')}</TableCell>
                  <TableCell align="right">{t('admin.revert')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {edits.map((e) => {
                  const changes = changedFields(e.before, e.after, t)
                  const rows = changes.length > 0 ? changes : [{ label: '—', before: '', after: '' }]
                  return rows.map((c, idx) => (
                    <TableRow key={`${e.id}-${idx}`} sx={idx === rows.length - 1 ? undefined : { '& td': { borderBottom: 0 } }}>
                      {idx === 0 && (
                        <TableCell rowSpan={rows.length}>
                          <Typography variant="caption" color="text.secondary">{e.createdAt ? timeAgo(e.createdAt, t) : ''}</Typography>
                        </TableCell>
                      )}
                      {idx === 0 && (
                        <TableCell rowSpan={rows.length}>
                          <Link component={RouterLink} to={`/fonts/${e.fontID}`}>{e.fontName ?? e.after.name}</Link>
                        </TableCell>
                      )}
                      {idx === 0 && (
                        <TableCell rowSpan={rows.length}>
                          {(e.editorName || e.editorID)
                            ? <Link component={RouterLink} to={`/users/${encodeURIComponent(e.editorName ?? e.editorID!)}`}>@{e.editorName ?? '—'}</Link>
                            : <Typography variant="body2" color="text.secondary">—</Typography>}
                        </TableCell>
                      )}
                      <TableCell sx={{ fontWeight: 600 }}>{c.label}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', textDecoration: 'line-through' }}>{c.before}</TableCell>
                      <TableCell>{c.after}</TableCell>
                      {idx === 0 && (
                        <TableCell rowSpan={rows.length} align="right">
                          <IconButton size="small" onClick={() => revert(e.id)} aria-label={t('admin.revert')} title={t('admin.revert')}>
                            <UndoIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {editsHasMore && (
          <Button onClick={loadMoreEdits} disabled={loadingMore} sx={{ mt: 1 }}>
            {loadingMore ? t('admin.loading') : t('admin.loadMore')}
          </Button>
        )}
      </Box>
    </Box>
  )
}

/** Campos que cambiaron entre dos instantáneas, ya formateados para la tabla. */
function changedFields(before: FontInfoSnapshot, after: FontInfoSnapshot, t: (k: string, p?: Record<string, string | number>) => string): { label: string; before: string; after: string }[] {
  const fmt = (field: 'name' | 'description' | 'source' | 'drinkable', v: string | null): string => {
    if (v == null || v === '') return t('admin.editEmpty')
    if (field === 'source') return t(`source.${v}`)
    if (field === 'drinkable') return t(`drink.${v}`)
    return v
  }
  const fields: { key: 'name' | 'description' | 'source' | 'drinkable'; label: string }[] = [
    { key: 'name', label: t('newFont.name') },
    { key: 'description', label: t('detail.description') },
    { key: 'source', label: t('detail.type') },
    { key: 'drinkable', label: t('detail.drinkability') },
  ]
  return fields
    .filter((f) => (before[f.key] ?? null) !== (after[f.key] ?? null))
    .map((f) => ({ label: f.label, before: fmt(f.key, before[f.key] as string | null), after: fmt(f.key, after[f.key] as string | null) }))
}
