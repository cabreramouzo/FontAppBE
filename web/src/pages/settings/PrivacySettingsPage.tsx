import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useI18n } from '../../i18n/I18nContext'
import { PantallaDeAjustes, useAjustes } from './comun'

export function PrivacySettingsPage() {
  const { t } = useI18n()
  const { user, guardar, guardando, error } = useAjustes()
  if (!user) return null

  return (
    <PantallaDeAjustes titulo={t('privacy.title')} intro={t('privacy.intro')} error={error}>
      <FormControlLabel
        control={<Switch checked={user.namePublic ?? true} disabled={guardando}
                         onChange={(e) => void guardar({ namePublic: e.target.checked })} />}
        label={t('privacy.namePublic')}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('privacy.namePublicHint')}
      </Typography>
      <FormControlLabel
        control={<Switch checked={!!user.emailPublic} disabled={guardando}
                         onChange={(e) => void guardar({ emailPublic: e.target.checked })} />}
        label={t('privacy.emailPublic')}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {t('privacy.emailPublicHint')}
      </Typography>
      <Box sx={{ mt: 2 }}>
        <Link component={RouterLink} to={`/users/${encodeURIComponent(user.username)}`}>
          {t('privacy.viewPublic')}
        </Link>
      </Box>
    </PantallaDeAjustes>
  )
}
