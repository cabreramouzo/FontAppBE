import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Badge from '@mui/material/Badge'
import Tooltip from '@mui/material/Tooltip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import GppMaybeIcon from '@mui/icons-material/GppMaybeOutlined'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { getFlags } from '../api/client'
import { Footer } from './Footer'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { OfflineBanner } from './OfflineBanner'
import { AppInterestBanner } from './AppInterestBanner'
import { InstallPrompt } from './InstallPrompt'

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [flagCount, setFlagCount] = useState(0)
  const [confirmLogout, setConfirmLogout] = useState(false)

  // Nº de denuncias pendientes (solo admins), para el badge de moderación.
  useEffect(() => {
    if (user?.isAdmin) getFlags().then((f) => setFlagCount(f.length)).catch(() => {})
    else setFlagCount(0)
  }, [user])

  return (
    <div className="app">
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default', pt: 'env(safe-area-inset-top)' }}>
        <Toolbar sx={{ gap: 1, pl: 'max(16px, env(safe-area-inset-left))', pr: 'max(16px, env(safe-area-inset-right))' }}>
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              component={RouterLink}
              to="/"
              variant="h6"
              sx={{ fontWeight: 800, color: 'primary.main', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              💧 FontApp
            </Typography>
            <Chip
              label="beta"
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', '& .MuiChip-label': { px: 0.75 } }}
            />
          </Box>
          <ThemeToggle />
          <LanguageSwitcher />
          {user ? (
            <>
              {user.isAdmin && (
                <Tooltip title={t('admin.title')}>
                  <IconButton component={RouterLink} to="/admin" color="inherit" size="small" aria-label={t('admin.title')}>
                    <Badge badgeContent={flagCount} color="error">
                      <GppMaybeIcon />
                    </Badge>
                  </IconButton>
                </Tooltip>
              )}
              {/* Perfil: texto con saludo en pantallas anchas; solo icono en móvil para que quepa. */}
              <Button
                component={RouterLink}
                to="/me"
                color="inherit"
                size="small"
                sx={{ textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}
                title={t('nav.profile')}
              >
                {t('nav.hello', { user: user.username })}
              </Button>
              <IconButton
                component={RouterLink}
                to="/me"
                color="inherit"
                size="small"
                aria-label={t('nav.profile')}
                sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
              >
                <AccountCircleIcon />
              </IconButton>
              {/* Salir: botón con texto en anchas; icono en móvil. */}
              <Button variant="contained" size="small" disableElevation onClick={() => setConfirmLogout(true)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
                {t('nav.logout')}
              </Button>
              <Tooltip title={t('nav.logout')}>
                <IconButton color="inherit" size="small" onClick={() => setConfirmLogout(true)} aria-label={t('nav.logout')} sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Button component={RouterLink} to="/login" variant="contained" size="small" disableElevation>{t('nav.enter')}</Button>
          )}
        </Toolbar>
      </AppBar>
      <OfflineBanner />
      <InstallPrompt />
      <Box component="main" className="main">{children}</Box>

      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t('logout.confirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('logout.confirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmLogout(false)}>{t('form.cancel')}</Button>
          <Button variant="contained" color="error" disableElevation onClick={() => { setConfirmLogout(false); logout() }}>
            {t('nav.logout')}
          </Button>
        </DialogActions>
      </Dialog>

      <Footer />
      <AppInterestBanner />
    </div>
  )
}
