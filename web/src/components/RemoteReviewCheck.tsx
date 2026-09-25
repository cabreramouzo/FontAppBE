import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'
import { trackInteraction } from '../api/client'
import { kmLabel, rememberRemoteConfirmed, remoteAlreadyConfirmed, remoteDistanceM } from '../lib/remoteReview'
import { reviewFix, warmReviewPosition } from '../lib/reviewPosition'

export type RemoteCheck = { proceed: boolean; remoteDistanceM?: number }

/**
 * "Did you see it recently?" before publishing a review far from the fountain.
 *
 * `check()` resolves to `{ proceed, remoteDistanceM }`: go ahead (with the distance to send
 * when it was remote) or stop because the person cancelled. It never blocks an honest
 * reviewer — one tap on "Yes, I saw it recently" publishes — and it asks at most once per
 * fountain per tab. See `lib/remoteReview.ts` for why it asks instead of refusing.
 *
 * Starts getting a position (only if permission is already granted) as soon as the
 * fountain is known, so publishing does not wait for the GPS.
 */
export function useRemoteReviewCheck(font: { id: string; latitude: number; longitude: number } | null | undefined): {
  check: () => Promise<RemoteCheck>
  dialog: ReactNode
} {
  const { t, lang } = useI18n()
  const [km, setKm] = useState<string | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => { if (font) void warmReviewPosition() }, [font?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setKm(null)
  }

  const check = useCallback(async (): Promise<RemoteCheck> => {
    if (!font) return { proceed: true }
    const d = remoteDistanceM(await reviewFix(), font)
    if (d === null) return { proceed: true }
    if (remoteAlreadyConfirmed(font.id)) return { proceed: true, remoteDistanceM: d }
    trackInteraction('review_remote_prompt')
    const ok = await new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setKm(kmLabel(d, lang))
    })
    if (!ok) { trackInteraction('review_remote_cancel'); return { proceed: false } }
    rememberRemoteConfirmed(font.id)
    return { proceed: true, remoteDistanceM: d }
  }, [font, lang])

  const dialog = (
    <Dialog open={km !== null} onClose={() => answer(false)} maxWidth="xs" fullWidth>
      <DialogTitle>{t('remote.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{t('remote.body', { km: km ?? '' })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => answer(false)}>{t('remote.cancel')}</Button>
        <Button variant="contained" onClick={() => answer(true)} autoFocus>{t('remote.confirm')}</Button>
      </DialogActions>
    </Dialog>
  )

  return { check, dialog }
}
