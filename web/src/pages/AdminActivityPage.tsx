import { useEffect } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { isAdminRole } from '../lib/roles'
import { ActivityFeed } from '../components/ActivityFeed'
import { ActivityGrid } from '../components/ActivityGrid'

// Historial largo de actividad. El panel muestra los últimos 15; aquí caben 100.
export function AdminActivityPage() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!isAdminRole(user)) navigate('/')
  }, [user, loading, navigate])

  if (!isAdminRole(user)) return null

  return (
    <Box className="pad" sx={{ maxWidth: 1040, mx: 'auto' }}>
      <Link component={RouterLink} to="/admin">{t('admin.title')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>📡 {t('activity.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('activity.intro')}</Typography>
      {/* Rejilla arriba (para mirar) y lista debajo (para revisar en detalle). */}
      <ActivityGrid limit={24} showFilter />
      <Typography variant="h6" sx={{ mt: 4, mb: 1, fontWeight: 700 }}>{t('activity.timeline')}</Typography>
      <ActivityFeed limit={100} />
    </Box>
  )
}
