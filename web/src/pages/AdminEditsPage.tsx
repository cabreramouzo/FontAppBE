import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import type { FontEdit } from '../api/types'
import { describeError, getFontEdits, reviewFontEdit, revertFontEdit, FONT_EDITS_PER } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { EditsTable } from '../components/EditsTable'
import { isAdminRole } from '../lib/roles'

export function AdminEditsPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [edits, setEdits] = useState<FontEdit[] | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (p: number) => {
    try {
      const e = await getFontEdits(p)
      setEdits(e)
      setPage(p)
      setHasMore(e.length === FONT_EDITS_PER)
    } catch (e) {
      setError(describeError(e, t))
      setEdits([])
    }
  }, [t])

  useEffect(() => {
    if (loading) return
    if (!isAdminRole(user)) { navigate('/'); return }
    load(1)
  }, [user, loading, navigate, load])

  async function accept(editID: string) {
    try {
      await reviewFontEdit(editID)
      setEdits((es) => es?.map((e) => (e.id === editID ? { ...e, reviewedAt: new Date().toISOString() } : e)) ?? null)
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  async function revert(editID: string) {
    if (!confirm(t('admin.confirmRevert'))) return
    try {
      await revertFontEdit(editID)
      load(1)
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  if (!isAdminRole(user)) return null

  return (
    <Box className="pad" sx={{ maxWidth: 1040, mx: 'auto' }}>
      <Link component={RouterLink} to="/admin">{t('admin.backPanel')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>✏️ {t('admin.editsTitle')}</Typography>
      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}

      {edits === null && <Skeleton lines={6} />}
      {edits?.length === 0 && <Typography color="text.secondary">{t('admin.noEdits')}</Typography>}
      {edits && edits.length > 0 && <EditsTable edits={edits} onRevert={revert} onAccept={accept} />}

      {(page > 1 || hasMore) && (
        <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center', justifyContent: 'center' }}>
          <Button size="small" disabled={page <= 1} onClick={() => load(page - 1)}>{t('admin.prev')}</Button>
          <Typography variant="body2" color="text.secondary">{page}</Typography>
          <Button size="small" disabled={!hasMore} onClick={() => load(page + 1)}>{t('admin.next')}</Button>
        </Stack>
      )}
    </Box>
  )
}
