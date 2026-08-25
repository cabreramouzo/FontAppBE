import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import LightModeIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined'
import AutoModeIcon from '@mui/icons-material/BrightnessAuto'
import { useI18n } from '../i18n/I18nContext'
import { useThemeMode, type ThemePref } from '../theme/ThemeModeContext'

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const ICON: Record<ThemePref, typeof LightModeIcon> = {
  system: AutoModeIcon,
  light: LightModeIcon,
  dark: DarkModeIcon,
}

// Alterna tema sistema → claro → oscuro (icono Material según la preferencia).
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { t } = useI18n()
  const { pref, setPref } = useThemeMode()
  const Icon = ICON[pref]
  return (
    <IconButton
      onClick={() => setPref(NEXT[pref])}
      title={t('theme.label')}
      aria-label={t('theme.label')}
      color="inherit"
      size="small"
      sx={showLabel ? { flexDirection: 'column', borderRadius: 2, px: 0.75, py: 0.375 } : undefined}
    >
      <Icon fontSize="small" />
      {showLabel && <Typography component="span" sx={{ fontSize: 10, lineHeight: 1.15 }}>{t('theme.label')}</Typography>}
    </IconButton>
  )
}
