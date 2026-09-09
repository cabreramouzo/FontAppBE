import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { listPending, type PendingView } from '../lib/outbox'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from './ToastContext'

/**
 * See — and copy — what's waiting in the outbox.
 *
 * The outbox never drops a contribution: on flaky coverage it retries forever, which is
 * right, but it left the user blind — trust it's saved, or discard and lose it. This shows
 * every queued item with its readable fields and its photo, and copies them to the
 * clipboard, so a new fountain's data is never trapped where nobody can read it. It is the
 * escape hatch for exactly the "retry, fail, retry" loop the user hit.
 */
export function PendingDetails({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const [items, setItems] = useState<PendingView[] | null>(null)

  useEffect(() => {
    if (!open) { setItems(null); return }
    let alive = true
    void listPending().then((r) => { if (alive) setItems(r) })
    return () => { alive = false }
  }, [open])

  // Object URLs for the photos. Created AND revoked in one effect, in state, not a memo:
  // the previous version made the URLs in a `useMemo` (during render) and only revoked
  // them in a separate cleanup, so on a re-open (or StrictMode's double-invoke) the URLs
  // could be revoked without being recreated — the photo came back as a broken "?".
  const [photoUrls, setPhotoUrls] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    const map = new Map<number, string>()
    for (const it of items ?? []) if (it.photo) map.set(it.id, URL.createObjectURL(it.photo))
    setPhotoUrls(map)
    return () => { for (const url of map.values()) URL.revokeObjectURL(url) }
  }, [items])

  const when = (ms: number): string | null => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString(lang) : null)

  const asJson = () => JSON.stringify((items ?? []).map((it) => ({
    ...it.fields,
    queuedAt: Number.isFinite(it.queuedAt) && it.queuedAt > 0 ? new Date(it.queuedAt).toISOString() : null,
    attempts: it.attempts,
  })), null, 2)

  async function copy() {
    try {
      await navigator.clipboard.writeText(asJson())
      toast.show(t('offline.copied'))
    } catch {
      toast.show(t('offline.copyFailed'))
    }
  }

  async function savePhoto(blob: Blob, id: number) {
    const file = new File([blob], `fontapp-${id}.jpg`, { type: blob.type || 'image/jpeg' })
    // iOS: the share sheet offers "Save Image" for a shared file — the reliable way into
    // the gallery from a web app (a plain <a download> is inert in the PWA sandbox).
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return } catch { /* cancelled or unsupported */ }
    }
    // Fallback: open the photo full-screen so it can be saved with a long-press.
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const titleOf = (it: PendingView) =>
    it.kind === 'font' ? t('offline.itemFont')
    : it.kind === 'comment' ? t('offline.itemReview')
    : t('offline.itemPhoto')

  // Show only the fields that carry something, in a stable, readable order.
  const rowsOf = (it: PendingView): [string, string][] => {
    const f = it.fields
    const rows: [string, string][] = []
    const push = (k: string, v: unknown) => { if (v !== null && v !== undefined && v !== '') rows.push([k, String(v)]) }
    push(t('offline.fName'), f.name)
    if (f.latitude !== undefined) push(t('offline.fCoords'), `${f.latitude}, ${f.longitude}`)
    push(t('offline.fStatus'), f.waterStatus ? t(`status.${f.waterStatus}`) : null)
    push(t('offline.fRating'), f.rating)
    push(t('offline.fText'), f.text ?? f.description)
    push(t('offline.fFont'), f.fontID)
    return rows
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('offline.detailsTitle')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('offline.detailsIntro')}</Typography>
        {items === null && <Typography variant="body2" color="text.secondary">…</Typography>}
        {items?.length === 0 && <Typography variant="body2" color="text.secondary">{t('offline.detailsEmpty')}</Typography>}
        {(items ?? []).map((it) => (
          <Box key={it.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0, pb: 0 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography sx={{ fontWeight: 700 }}>{titleOf(it)}</Typography>
              {!it.mine && <Chip size="small" color="warning" label={t('offline.itemOther')} />}
              {it.needsAuth && <Chip size="small" label={t('offline.itemNeedsAuth')} />}
            </Box>
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5 }}>
              {rowsOf(it).map(([k, v]) => (
                <Box key={k} sx={{ display: 'contents' }}>
                  <Typography component="dt" variant="body2" color="text.secondary">{k}</Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{v}</Typography>
                </Box>
              ))}
            </Box>
            {photoUrls.get(it.id) && it.photo && (
              <Box sx={{ mt: 1 }}>
                <Box component="img" src={photoUrls.get(it.id)} alt=""
                     sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1, display: 'block' }} />
                <Button size="small" onClick={() => savePhoto(it.photo!, it.id)}
                        sx={{ textTransform: 'none', px: 0, minWidth: 0, mt: 0.25, '&:hover': { bgcolor: 'transparent' } }}>
                  {t('offline.savePhoto')}
                </Button>
              </Box>
            )}
            {(when(it.queuedAt) || it.attempts > 0) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {when(it.queuedAt) ?? ''}
                {when(it.queuedAt) && it.attempts > 0 ? ' · ' : ''}
                {it.attempts > 0 ? t('offline.attempts', { n: String(it.attempts) }) : ''}
              </Typography>
            )}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        {(items?.length ?? 0) > 0 && (
          <Button onClick={copy}>{t('offline.copyJson')}</Button>
        )}
        <Button variant="contained" disableElevation onClick={onClose}>{t('offline.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
