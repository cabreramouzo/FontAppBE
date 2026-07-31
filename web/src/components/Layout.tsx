import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Badge from '@mui/material/Badge'
import Tooltip from '@mui/material/Tooltip'
import GppMaybeIcon from '@mui/icons-material/GppMaybeOutlined'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { getFlags } from '../api/client'
import { Footer } from './Footer'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { OfflineBanner } from './OfflineBanner'

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [flagCount, setFlagCount] = useState(0)

  // Nº de denuncias pendientes (solo admins), para el badge de moderación.
  useEffect(() => {
    if (user?.isAdmin) getFlags().then((f) => setFlagCount(f.length)).catch(() => {})
    else setFlagCount(0)
  }, [user])

  return (
    <div className="app">
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography
            component={RouterLink}
            to="/"
            variant="h6"
            sx={{ flexGrow: 1, fontWeight: 800, color: 'primary.main', textDecoration: 'none' }}
          >
            💧 FontApp
          </Typography>
          <ThemeToggle />
          <LanguageSwitcher />
          {user ? (
            <>
              {user.isAdmin && (
                <Tooltip title={t('admin.flags')}>
                  <IconButton component={RouterLink} to="/me" color="inherit" size="small" aria-label={t('admin.flags')}>
                    <Badge badgeContent={flagCount} color="error">
                      <GppMaybeIcon />
                    </Badge>
                  </IconButton>
                </Tooltip>
              )}
              <Button component={RouterLink} to="/me" color="inherit" size="small" sx={{ textTransform: 'none' }} title={t('nav.profile')}>
                {t('nav.hello', { user: user.username })}
              </Button>
              <Button variant="contained" size="small" disableElevation onClick={() => logout()}>{t('nav.logout')}</Button>
            </>
          ) : (
            <Button component={RouterLink} to="/login" variant="contained" size="small" disableElevation>{t('nav.enter')}</Button>
          )}
        </Toolbar>
      </AppBar>
      <OfflineBanner />
      <Box component="main" className="main">{children}</Box>
      <Footer />
    </div>
  )
}
