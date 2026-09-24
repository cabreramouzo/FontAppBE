import { useEffect, useReducer } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { useToast } from './ToastContext'
import { readSavedZone, saveZone, savedZoneHref, SAVED_ZONE_EVENT, type SavedZone } from '../lib/savedZone'
import { rutaRecordada } from '../lib/routeMemory'

function useSavedZone() {
  const { user, loading } = useAuth()
  const scope = user?.id ?? 'anonymous'
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    window.addEventListener(SAVED_ZONE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(SAVED_ZONE_EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [])
  return { scope, loading, zone: loading ? null : readSavedZone(scope) }
}
export function SaveZoneButton({ zone }: { zone: SavedZone }) {
  const { t } = useI18n()
  const toast = useToast()
  const saved = useSavedZone()
  const selected = !!saved.zone && savedZoneHref(saved.zone) === savedZoneHref(zone)
  return <Button size="small" title={t('return.device')} disabled={saved.loading} aria-pressed={selected} onClick={() => {
    if (!saveZone(saved.scope, selected ? null : zone)) { toast.show(t('return.saveFailed'), 'error'); return }
    window.dispatchEvent(new Event(SAVED_ZONE_EVENT))
    toast.show(t(selected ? 'return.removed' : 'return.saved'))
  }}>{t(selected ? 'return.unfollow' : 'return.follow')}</Button>
}
export function SavedOuting() {
  const { t } = useI18n()
  const { scope, loading, zone } = useSavedZone()
  const route = loading ? null : rutaRecordada(scope)
  if (!zone && !route) return null
  return <Box sx={{ mb: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
    <Typography variant="subtitle2">{t('return.title')}</Typography>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('return.device')}</Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
      {zone && <Button component={RouterLink} to={savedZoneHref(zone)} variant="outlined" size="small">{zone.name}</Button>}
      {route && <Button component={RouterLink} to="/gpx" variant="outlined" size="small">{t('return.route', { name: route.nombre })}</Button>}
    </Box>
  </Box>
}
