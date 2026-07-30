import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { useI18n } from '../i18n/I18nContext'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <Box className="pad" sx={{ textAlign: 'center', pt: 6 }}>
      <Box sx={{ fontSize: 56 }}>💧</Box>
      <Typography variant="h2" sx={{ fontWeight: 800 }}>404</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>{t('notFound.title')}</Typography>
      <Button component={RouterLink} to="/" variant="contained" disableElevation>{t('notFound.back')}</Button>
    </Box>
  )
}
