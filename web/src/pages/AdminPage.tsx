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
import UndoIcon from '@mui/icons-material/Undo'
import type { Flag, FontEdit, FontInfoSnapshot, RegionStat } from '../api/types'
import { assetUrl, describeError, dismissFlag, getFlags, getFontEdits, getRegionStats, revertFontEdit, FONT_EDITS_PER } from '../api/client'
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
        <Typography variant="h6" gutterBottom>✏️ {t('admin.edits')}</Typography>
        {edits === null && <Skeleton lines={2} />}
        {edits?.length === 0 && <Typography color="text.secondary">{t('admin.noEdits')}</Typography>}
        <List disablePadding>
          {edits?.map((e) => (
            <ListItem
              key={e.id}
              divider
              disableGutters
              secondaryAction={
                <IconButton edge="end" size="small" onClick={() => revert(e.id)} aria-label={t('admin.revert')} title={t('admin.revert')}>
                  <UndoIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemText
                slotProps={{ primary: { component: 'div' } }}
                primary={
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Link component={RouterLink} to={`/fonts/${e.fontID}`}>{e.fontName ?? e.after.name}</Link>
                      <Typography component="span" variant="caption" color="text.secondary">
                        {`${e.editorName ?? '—'} · ${e.createdAt ? timeAgo(e.createdAt, t) : ''}`}
                      </Typography>
                    </Box>
                    <EditDiff before={e.before} after={e.after} t={t} />
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
        {editsHasMore && (
          <Button onClick={loadMoreEdits} disabled={loadingMore} sx={{ mt: 1 }}>
            {loadingMore ? t('admin.loading') : t('admin.loadMore')}
          </Button>
        )}
      </Box>
    </Box>
  )
}

/** Muestra los campos que cambiaron entre dos instantáneas: "antes → después". */
function EditDiff({ before, after, t }: { before: FontInfoSnapshot; after: FontInfoSnapshot; t: (k: string, p?: Record<string, string | number>) => string }) {
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
  const changed = fields.filter((f) => (before[f.key] ?? null) !== (after[f.key] ?? null))
  if (changed.length === 0) return null
  return (
    <Box sx={{ mt: 0.5 }}>
      {changed.map((f) => (
        <Typography key={f.key} variant="body2" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <Box component="span" sx={{ fontWeight: 600 }}>{f.label}</Box>
          <Box component="span" sx={{ color: 'text.secondary', textDecoration: 'line-through' }}>{fmt(f.key, before[f.key] as string | null)}</Box>
          <Box component="span">→</Box>
          <Box component="span">{fmt(f.key, after[f.key] as string | null)}</Box>
        </Typography>
      ))}
    </Box>
  )
}
