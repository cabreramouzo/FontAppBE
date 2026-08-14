import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { useI18n } from '../i18n/I18nContext'
import { DryFountain } from '../components/DryFountain'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <Box className="pad">
      <DryFountain title={t('notFound.title')} subtitle={t('notFound.body')}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>404</Typography>
        <Button component={RouterLink} to="/" variant="contained" disableElevation>{t('notFound.back')}</Button>
      </DryFountain>
    </Box>
  )
}
