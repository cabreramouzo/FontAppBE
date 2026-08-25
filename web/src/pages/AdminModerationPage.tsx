import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Flag, ModerationSource } from '../api/types'
import {
  approvePhotoRemoval, assetUrl, deleteComment, deleteSecondaryPhoto, describeError, dismissFlag,
  getFlags, getModerationSources, hideFontAbuse, restoreFontAbuse,
  restrictUserPosting, reviewModerationSource,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { canModerate, isOwner } from '../lib/roles'
import { timeAgo } from '../lib/time'

type Filter = 'all' | 'reports' | 'new'
type Reason = 'fake' | 'spam' | 'abuse'

type FlagGroup = {
  key: string
  flags: Flag[]
  first: Flag
}

export function AdminModerationPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [flags, setFlags] = useState<Flag[] | null>(null)
  const [sources, setSources] = useState<ModerationSource[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = () => {
    getFlags().then(setFlags).catch((e) => setError(describeError(e, t)))
    getModerationSources().then(setSources).catch((e) => setError(describeError(e, t)))
  }

  useEffect(() => {
    if (loading) return
    if (!canModerate(user)) { navigate('/'); return }
    refresh()
    // `t` cambia al cambiar idioma; recargar por eso no aporta nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, navigate])

  const groups = useMemo<FlagGroup[]>(() => {
    const byTarget = new Map<string, Flag[]>()
    for (const flag of flags ?? []) {
      const key = `${flag.targetType}:${flag.targetID}`
      byTarget.set(key, [...(byTarget.get(key) ?? []), flag])
    }
    return [...byTarget.entries()].map(([key, grouped]) => ({ key, flags: grouped, first: grouped[0] }))
  }, [flags])

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key); setError('')
    try { await action(); refresh() }
    catch (e) { setError(describeError(e, t)) }
    finally { setBusy(null) }
  }

  async function clear(group: FlagGroup) {
    await Promise.all(group.flags.map((flag) => dismissFlag(flag.id)))
  }

  function approve(group: FlagGroup) {
    void run(group.key, async () => {
      if (group.first.targetType === 'cover_photo_removal') {
        await approvePhotoRemoval(group.first.id)
        return
      }
      if (group.first.targetType === 'font' && group.first.fontModerationState !== 'visible') {
        await restoreFontAbuse(group.first.targetID)
      }
      await clear(group)
    })
  }

  function remove(group: FlagGroup, reason: Reason) {
    if (group.first.targetType === 'cover_photo_removal') {
      void run(group.key, () => clear(group))
      return
    }
    if (!confirm(t('moderation.confirmRemove'))) return
    void run(group.key, async () => {
      const item = group.first
      const fontID = item.fontID ?? (item.targetType === 'font' ? item.targetID : null)
      if (item.targetType === 'font') await hideFontAbuse(item.targetID, reason)
      else if (item.targetType === 'comment' && fontID) await deleteComment(fontID, item.targetID)
      else if (item.targetType === 'photo' && fontID) await deleteSecondaryPhoto(fontID, item.targetID)
      await clear(group)
    })
  }

  function reviewSource(source: ModerationSource) {
    void run(`new:${source.id}`, async () => { await reviewModerationSource(source.id) })
  }

  function hideSource(source: ModerationSource, reason: Reason) {
    if (!confirm(t('moderation.confirmRemove'))) return
    void run(`new:${source.id}`, async () => { await hideFontAbuse(source.id, reason) })
  }

  function restrict(authorID: string | null, key: string) {
    if (!authorID || !confirm(t('moderation.confirmRestrict'))) return
    void run(key, async () => { await restrictUserPosting(authorID, 7) })
  }

  if (!canModerate(user)) return null
  const total = groups.length + (sources?.length ?? 0)

  return (
    <Box className="pad" sx={{ maxWidth: 1100, mx: 'auto' }}>
      <Link component={RouterLink} to="/admin">{t('admin.backPanel')}</Link>
      <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>🛡️ {t('moderation.title')}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>{t('moderation.intro')}</Typography>
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      <Stack direction="row" spacing={1} useFlexGap sx={{ my: 2, flexWrap: 'wrap' }}>
        <Chip clickable color={filter === 'all' ? 'primary' : 'default'} label={`${t('moderation.all')} · ${total}`} onClick={() => setFilter('all')} />
        <Chip clickable color={filter === 'reports' ? 'primary' : 'default'} label={`${t('moderation.reported')} · ${groups.length}`} onClick={() => setFilter('reports')} />
        <Chip clickable color={filter === 'new' ? 'primary' : 'default'} label={`${t('moderation.newAccounts')} · ${sources?.length ?? 0}`} onClick={() => setFilter('new')} />
      </Stack>

      {(flags === null || sources === null) && <Skeleton lines={5} />}
      {flags !== null && sources !== null && total === 0 && <Alert severity="success">{t('moderation.empty')}</Alert>}

      <Stack spacing={2}>
        {filter !== 'new' && groups.map((group) => (
          <ModerationCard
            key={group.key}
            title={group.first.targetText || group.first.fontName || t('font.unnamed')}
            image={group.first.targetImage}
            fontID={group.first.fontID ?? (group.first.targetType === 'font' ? group.first.targetID : null)}
            latitude={group.first.fontLatitude}
            longitude={group.first.fontLongitude}
            authorID={group.first.targetAuthorID}
            authorName={group.first.targetAuthorName}
            authorCreatedAt={group.first.targetAuthorCreatedAt}
            strikes={group.first.targetAuthorStrikes}
            restrictedUntil={group.first.targetAuthorRestrictedUntil}
            createdAt={group.first.createdAt}
            chips={[
              t(`moderation.type.${group.first.targetType}`),
              group.first.targetType === 'cover_photo_removal'
                ? t('moderation.authorRemovalRequest')
                : t('moderation.reportsCount', { n: group.flags.length }),
              ...[...new Set(group.flags.map((f) => f.reason).filter(Boolean) as string[])],
            ]}
            busy={busy === group.key}
            onApprove={() => approve(group)}
            onRemove={(reason) => remove(group, reason)}
            removalRequest={group.first.targetType === 'cover_photo_removal'}
            onRestrict={isOwner(user) ? () => restrict(group.first.targetAuthorID, group.key) : undefined}
            t={t}
          />
        ))}

        {filter !== 'reports' && (sources ?? []).map((source) => (
          <ModerationCard
            key={`new:${source.id}`}
            title={source.name || t('font.unnamed')}
            image={source.image}
            fontID={source.id}
            latitude={source.latitude}
            longitude={source.longitude}
            authorID={source.authorID}
            authorName={source.authorName}
            authorCreatedAt={source.authorCreatedAt}
            strikes={source.moderationStrikes}
            restrictedUntil={source.postingRestrictedUntil}
            createdAt={source.createdAt}
            chips={[t('moderation.newAccount')]}
            busy={busy === `new:${source.id}`}
            onApprove={() => reviewSource(source)}
            onRemove={(reason) => hideSource(source, reason)}
            onRestrict={isOwner(user) ? () => restrict(source.authorID, `new:${source.id}`) : undefined}
            t={t}
          />
        ))}
      </Stack>
    </Box>
  )
}

function ModerationCard(props: {
  title: string; image: string | null; fontID: string | null
  latitude: number | null; longitude: number | null
  authorID: string | null; authorName: string | null; authorCreatedAt: string | null
  strikes: number; restrictedUntil: string | null; createdAt: string | null
  chips: string[]; busy: boolean; onApprove: () => void
  onRemove: (reason: Reason) => void; onRestrict?: () => void
  removalRequest?: boolean; t: (key: string, params?: Record<string, string | number>) => string
}) {
  const { t } = props
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'grid', gridTemplateColumns: props.image ? { xs: '1fr', sm: '140px 1fr' } : '1fr', gap: 2 }}>
        {props.image && <Box component="img" src={assetUrl(props.image)} alt="" sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 1.5 }} />}
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {props.chips.map((chip, i) => <Chip key={`${chip}:${i}`} size="small" label={chip} color={i === 0 ? 'warning' : 'default'} />)}
            {props.strikes > 0 && <Chip size="small" color="error" label={t('admin.strikes', { n: props.strikes })} />}
            {props.restrictedUntil && <Chip size="small" color="error" variant="outlined" label={t('moderation.restricted')} />}
          </Stack>
          <Typography variant="h6" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{props.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {props.authorName ? <Link component={RouterLink} to={`/users/${encodeURIComponent(props.authorName)}`}>@{props.authorName}</Link> : '—'}
            {props.authorCreatedAt && ` · ${t('moderation.accountAge', { age: timeAgo(props.authorCreatedAt, t) })}`}
            {props.createdAt && ` · ${t('moderation.contentAge', { age: timeAgo(props.createdAt, t) })}`}
          </Typography>
          {props.latitude != null && props.longitude != null && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {props.latitude.toFixed(5)}, {props.longitude.toFixed(5)}
            </Typography>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap' }}>
            {props.fontID && <Button size="small" component={RouterLink} to={`/fonts/${props.fontID}`}>{t('admin.viewTarget')}</Button>}
            <Button size="small" variant="contained" color="success" disableElevation disabled={props.busy} onClick={props.onApprove}>{props.removalRequest ? t('moderation.removePhoto') : t('moderation.approve')}</Button>
            {props.removalRequest ? (
              <Button size="small" disabled={props.busy} onClick={() => props.onRemove('fake')}>{t('moderation.rejectRequest')}</Button>
            ) : <>
              <Button size="small" color="error" disabled={props.busy} onClick={() => props.onRemove('fake')}>{t('moderation.fake')}</Button>
              <Button size="small" color="error" disabled={props.busy} onClick={() => props.onRemove('spam')}>{t('moderation.spam')}</Button>
              <Button size="small" color="error" disabled={props.busy} onClick={() => props.onRemove('abuse')}>{t('moderation.abuse')}</Button>
            </>}
            {props.onRestrict && <Button size="small" variant="outlined" color="error" disabled={props.busy} onClick={props.onRestrict}>{t('moderation.restrict7')}</Button>}
          </Stack>
        </Box>
      </CardContent>
    </Card>
  )
}
