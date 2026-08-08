import { useCallback, useEffect, useState } from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import { flushOutbox, onOutboxChanged, pendingCount } from '../lib/outbox'
import { useI18n } from '../i18n/I18nContext'

// Aviso de aportaciones guardadas sin cobertura. Solo aparece si hay algo pendiente,
// para que nada parezca perdido, y permite forzar el envío sin esperar.
export function PendingUploads() {
  const { t } = useI18n()
  const [count, setCount] = useState(0)
  const [sending, setSending] = useState(false)

  const refresh = useCallback(() => { void pendingCount().then(setCount) }, [])

  useEffect(() => {
    refresh()
    const off = onOutboxChanged(refresh)
    window.addEventListener('online', refresh)
    return () => {
      off()
      window.removeEventListener('online', refresh)
    }
  }, [refresh])

  async function sendNow() {
    setSending(true)
    try {
      await flushOutbox()
    } finally {
      setSending(false)
      refresh()
    }
  }

  if (count === 0) return null

  return (
    <Paper
      square
      elevation={0}
      role="status"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
    >
      <CloudOffIcon color="warning" fontSize="small" />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('offline.pending', { n: count })}</Typography>
        <Typography variant="caption" color="text.secondary">{t('offline.pendingHint')}</Typography>
      </Box>
      <Button size="small" variant="contained" disableElevation onClick={sendNow} disabled={sending}>
        {sending ? t('offline.sending') : t('offline.sendNow')}
      </Button>
    </Paper>
  )
}
