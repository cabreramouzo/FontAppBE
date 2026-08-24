import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import SyncProblemIcon from '@mui/icons-material/SyncProblem'
import { flushOutbox, isOutboxSyncing, onOutboxChanged, onOutboxSyncState, pendingStatus } from '../lib/outbox'
import { useI18n } from '../i18n/I18nContext'
import { TarjetaDeAviso } from './Avisos'

// Aviso de aportaciones guardadas sin cobertura. Solo aparece si hay algo pendiente,
// para que nada parezca perdido, y permite forzar el envío sin esperar.
export function PendingUploads() {
  const { t } = useI18n()
  const [count, setCount] = useState(0)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [sending, setSending] = useState(isOutboxSyncing)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [recentlySynced, setRecentlySynced] = useState(false)
  const [syncTried, setSyncTried] = useState(false)

  const refresh = useCallback(() => {
    void pendingStatus().then(({ count, needsAuth }) => { setCount(count); setNeedsAuth(needsAuth) })
  }, [])

  useEffect(() => {
    refresh()
    const off = onOutboxChanged(refresh)
    const offSync = onOutboxSyncState(({ syncing, sent }) => {
      setSending(syncing)
      refresh()
      if (!syncing) setSyncTried(true)
      if (!syncing && sent > 0) setRecentlySynced(true)
    })
    const connectionChanged = () => { setOnline(navigator.onLine); refresh() }
    window.addEventListener('online', connectionChanged)
    window.addEventListener('offline', connectionChanged)
    return () => {
      off()
      offSync()
      window.removeEventListener('online', connectionChanged)
      window.removeEventListener('offline', connectionChanged)
    }
  }, [refresh])

  useEffect(() => {
    if (!recentlySynced) return
    const timer = window.setTimeout(() => setRecentlySynced(false), 4000)
    return () => window.clearTimeout(timer)
  }, [recentlySynced])

  async function sendNow() {
    setSending(true)
    try {
      await flushOutbox()
    } finally {
      setSending(false)
      refresh()
    }
  }

  if (count === 0 && !recentlySynced && online) return null

  const title = !online
    ? (count > 0 ? t('offline.offlinePending', { n: count }) : t('offline.banner'))
    : sending
      ? t('offline.syncing', { n: count })
      : count === 0
        ? t('offline.synced')
        : t('offline.pending', { n: count })
  const detail = !online
    ? (count > 0 ? t('offline.savedSafe') : t('offline.connectionHint'))
    : count === 0
      ? t('offline.syncedHint')
      : needsAuth
        ? t('offline.needsLogin')
        : syncTried
          ? t('offline.retryHint')
          : t('offline.pendingHint')
  const icon = !online
    ? <CloudOffIcon color="warning" fontSize="small" />
    : sending
      ? <CircularProgress size={20} aria-hidden="true" />
      : count === 0
        ? <CloudDoneIcon color="success" fontSize="small" />
        : <SyncProblemIcon color="warning" fontSize="small" />

  return (
    <TarjetaDeAviso>
      {icon}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>
      </Box>
      {count > 0 && online && needsAuth ? (
        // Reintentar no sirve hasta que vuelva a haber sesión: le llevamos al acceso.
        <Button size="small" variant="contained" disableElevation component="a" href="/login">
          {t('nav.enter')}
        </Button>
      ) : count > 0 && online ? (
        <Button size="small" variant="contained" disableElevation onClick={sendNow} disabled={sending}>
          {sending ? t('offline.sending') : t('offline.sendNow')}
        </Button>
      ) : null}
    </TarjetaDeAviso>
  )
}
