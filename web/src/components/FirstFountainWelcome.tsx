import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { useTurno, sesiones } from '../lib/asks'
import { positionIfAllowed, askPosition } from '../lib/quietPosition'
import { nearbyFonts, setFavorite, trackInteraction } from '../api/client'
import type { FontSummary } from '../api/types'
import { constaAgua } from '../lib/confidence'
import { firstFountainKind, type FirstFountainKind, type Nearest } from '../lib/firstFountain'
import { haversineKm } from '../lib/geo'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'

const SEEN = 'firstFountain:seen'

type State =
  | { phase: 'askLocation' }
  | { phase: 'card'; kind: FirstFountainKind; nearest: FontSummary | null; distanceKm: number }

/**
 * The first-visit "aha": right after a newcomer grants location, one card that answers
 * "where do I drink?" instead of dropping them on an abstract map of dots.
 *
 * Runs through the `asks` queue (never a stray popup on top of the others) and only in the
 * first couple of sessions, once. The message adapts to what is actually nearby — see
 * `firstFountain.ts`. First it gives (a route to water, or a small quest), only then does
 * it ask anything.
 */
export function FirstFountainWelcome() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<State | null>(null)

  // Decide once, early: are we a candidate, and do we already have location?
  //
  // No `decided` ref guard here on purpose: it interacts badly with StrictMode's
  // mount/unmount/remount. The first mount would arm the async and its cleanup would set
  // `alive = false`; the second mount would bail on the ref and never re-arm, so the
  // resolved async sees a dead `alive` and never calls setState. The `alive` flag alone is
  // the correct pattern — the second mount's async is the one that wins. Running the
  // checks twice in dev is harmless (`sesiones()` is idempotent per tab session).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (sesiones() > 2 || localStorage.getItem(SEEN)) return
      } catch { /* private mode: treat as first visit, keep going */ }
      const pos = await positionIfAllowed()
      if (!alive) return
      if (pos) await resolveNearest(pos)
      else setState({ phase: 'askLocation' })
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resolveNearest([lat, long]: [number, number]) {
    try {
      const fs = await nearbyFonts(lat, long, 1)
      const nearest = fs[0] ?? null
      const distanceKm = nearest ? haversineKm(lat, long, nearest.latitude, nearest.longitude) : Infinity
      const arg: Nearest | null = nearest ? { distanceKm, hasWaterNow: constaAgua(nearest) } : null
      setState({ phase: 'card', kind: firstFountainKind(arg), nearest, distanceKm })
    } catch {
      // A network hiccup here is not worth a broken welcome: just don't show it.
      cierra(false)
    }
  }

  // The card is "ready to speak"; the queue decides if it's its turn.
  const hayAlgo = state?.phase === 'card' || state?.phase === 'askLocation'
  const visible = useTurno('firstFountain', hayAlgo)

  useEffect(() => {
    if (state?.phase === 'card') trackInteraction(`first_fountain_${state.kind}`)
  }, [state])

  function marcaVisto() {
    try { localStorage.setItem(SEEN, '1') } catch { /* nothing to do */ }
  }

  function cierra(track = true) {
    if (track) trackInteraction('first_fountain_dismiss')
    marcaVisto()
    setState(null)
  }

  async function activaUbicacion() {
    trackInteraction('first_fountain_locate')
    const pos = await askPosition()
    if (pos) await resolveNearest(pos)
    else cierra(false) // denied: don't insist, don't burn the moment
  }

  if (!visible || !state) return null

  const dist = (km: number) =>
    km < 1 ? t('maint.metresAway', { n: String(Math.round(km * 1000)) })
           : t('maint.kmAway', { n: km.toFixed(1) })

  // ── Reframe the location permission as a benefit, not a cold browser prompt.
  if (state.phase === 'askLocation') {
    return (
      <Dialog open onClose={() => cierra()} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', pt: 4 }}>
          <Typography sx={{ fontSize: 48, lineHeight: 1 }}>💧</Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>{t('firstFountain.enableTitle')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{t('firstFountain.enableBody')}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexDirection: 'column', gap: 1 }}>
          <Button fullWidth variant="contained" disableElevation onClick={activaUbicacion}>{t('firstFountain.enableCta')}</Button>
          <Button fullWidth onClick={() => cierra()} sx={{ color: 'text.secondary' }}>{t('firstFountain.keepExploring')}</Button>
        </DialogActions>
      </Dialog>
    )
  }

  const { kind, nearest, distanceKm } = state

  async function irAllfuente() {
    if (!nearest) return
    trackInteraction('first_fountain_go')
    marcaVisto()
    setState(null)
    navigate(`/fonts/${nearest.id}`)
  }

  async function guarda() {
    if (!nearest) return
    trackInteraction('first_fountain_save')
    // Signed out, saving still means something: send them to sign in with intent.
    try { if (user) await setFavorite(nearest.id, true) } catch { /* best effort */ }
    marcaVisto()
    setState(null)
    if (!user) navigate('/login')
  }

  function añadir() {
    trackInteraction('first_fountain_add')
    marcaVisto()
    setState(null)
    navigate('/') // the map is where you add one; the FAB / long-press live there
  }

  const titulo =
    kind === 'gift' ? t('firstFountain.giftTitle', { dist: dist(distanceKm) })
    : kind === 'mission' ? t('firstFountain.missionTitle', { dist: dist(distanceKm) })
    : t('firstFountain.exploreTitle')
  const cuerpo =
    kind === 'gift' ? t('firstFountain.giftBody')
    : kind === 'mission' ? t('firstFountain.missionBody')
    : t('firstFountain.exploreBody')

  return (
    <Dialog open onClose={() => cierra()} maxWidth="xs" fullWidth>
      <DialogContent sx={{ textAlign: 'center', pt: 4 }}>
        <Typography sx={{ fontSize: 48, lineHeight: 1 }}>
          {kind === 'gift' ? '💧' : kind === 'mission' ? '🔍' : '🗺️'}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>{titulo}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{cuerpo}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexDirection: 'column', gap: 1 }}>
        {/* Give first: the primary action is what they came for. Ask second, quietly. */}
        {kind === 'explore' ? (
          <Button fullWidth variant="contained" disableElevation onClick={añadir}>{t('firstFountain.addOne')}</Button>
        ) : (
          <>
            <Button fullWidth variant="contained" disableElevation onClick={irAllfuente}>{t('firstFountain.goThere')}</Button>
            <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
              <Button fullWidth onClick={guarda} sx={{ color: 'text.secondary' }}>{t('firstFountain.save')}</Button>
              <Button fullWidth onClick={() => cierra()} sx={{ color: 'text.secondary' }}>{t('firstFountain.keepExploring')}</Button>
            </Box>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
