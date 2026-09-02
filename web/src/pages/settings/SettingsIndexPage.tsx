import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { deleteAccount, describeError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useI18n } from '../../i18n/I18nContext'
import { estado as estadoPush, type EstadoPush } from '../../lib/push'
import { ocupado } from '../../lib/almacen'
import { formateaTamano } from '../../lib/tamanos'

/**
 * El índice de los ajustes: una pantalla por tema, como los del teléfono.
 *
 * ## Por qué se partió
 *
 * Eran **siete secciones y unos diez interruptores** en una sola columna, y cada
 * interruptor arrastra dos o tres líneas de explicación. Ese texto es bueno —dice lo que
 * cuesta cada decisión— pero todo seguido convierte una lista de seis cosas en un muro.
 * Partido, cada pantalla tiene sitio para explicarse y el índice se lee de un vistazo.
 *
 * ## Y por qué cada fila enseña su estado
 *
 * Un índice que solo son seis enlaces es **peor** que la página larga: añade un toque y no
 * dice nada. Lo que hace útiles los ajustes de un teléfono es que la fila ya contesta
 * —«Avisos: activados», «Espacio: 1,2 GB»— y solo entras a lo que quieres cambiar. Si
 * alguna vez esto estorba, lo que sobra es la subpantalla, no el estado.
 *
 * ## La zona de peligro se queda AQUÍ
 *
 * No es un tema, es una acción, y borrar la cuenta tiene que poder encontrarse sin
 * explorar. Metida dentro de una subpantalla parecería que la estamos escondiendo.
 */
export function SettingsIndexPage() {
  const { user, loading, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [dangerOpen, setDangerOpen] = useState(false)
  const [error, setError] = useState('')
  const [push, setPush] = useState<EstadoPush | null>(null)
  const [espacio, setEspacio] = useState<string | null>(null)
  const { lang } = useI18n()

  useEffect(() => {
    if (!loading && !user) window.location.replace('/login')
  }, [loading, user])

  // El estado de las dos filas que no se pueden deducir del perfil: el push lo concede el
  // navegador y el espacio lo dice el navegador.
  useEffect(() => {
    void estadoPush().then(setPush)
    void ocupado().then((o) => setEspacio(o !== null ? formateaTamano(o, lang) : null))
  }, [lang])

  if (loading || !user) return null

  async function removeAccount() {
    if (!user || !confirm(t('profile.confirmDelete'))) return
    try {
      await deleteAccount(user.id)
      await logout()
      navigate('/')
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  // El resumen de privacidad nombra **lo que se ve**, no cuántos interruptores hay
  // encendidos: la pregunta que se trae aquí es «¿qué ven los demás de mí?».
  const publico = [
    (user.namePublic ?? true) ? t('privacy.rowName') : null,
    user.emailPublic ? t('privacy.rowEmail') : null,
  ].filter(Boolean).join(' · ') || t('privacy.rowOnlyUser')

  const avisos = [
    (user.weeklyDigest ?? true) ? t('notif.rowWeekly') : null,
    push === 'encendido' ? t('notif.rowPush') : null,
  ].filter(Boolean).join(' · ') || t('notif.rowNone')

  const filas = [
    { to: 'account', icon: <PersonOutlineIcon />, label: t('settings.account'), estado: `@${user.username}` },
    { to: 'privacy', icon: <LockOutlinedIcon />, label: t('privacy.title'), estado: publico },
    { to: 'notifications', icon: <NotificationsNoneIcon />, label: t('notif.title'), estado: avisos },
    { to: 'contribution', icon: <WaterDropOutlinedIcon />, label: t('game.title'),
      estado: (user.gamificationOptOut ?? false) ? t('game.rowHidden') : t('game.rowShared') },
    { to: 'storage', icon: <PhoneIphoneIcon />, label: t('storage.title'), estado: espacio ?? '' },
  ]

  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/me">← {t('nav.profile')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{t('settings.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('settings.intro')}</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <List sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', p: 0 }}>
        {filas.map((f, i) => (
          <ListItemButton
            key={f.to}
            component={RouterLink}
            to={`/me/settings/${f.to}`}
            // 56 px: la misma medida que las filas de la búsqueda a pantalla completa y
            // las hojas del mapa. Esto se toca con el pulgar.
            sx={{ minHeight: 56, borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>{f.icon}</ListItemIcon>
            <ListItemText
              primary={f.label}
              secondary={f.estado || undefined}
              slotProps={{ primary: { variant: 'body1' }, secondary: { variant: 'caption' } }}
            />
            <ChevronRightIcon sx={{ color: 'text.disabled' }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ my: 3 }} />
      <Box component="section" sx={{ mb: 2, border: 1, borderColor: 'error.main', borderRadius: 2, overflow: 'hidden' }}>
        <Button
          fullWidth
          color="error"
          onClick={() => setDangerOpen((o) => !o)}
          startIcon={<WarningAmberIcon />}
          endIcon={<ExpandMoreIcon sx={{ transform: dangerOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
          sx={{ justifyContent: 'space-between', px: 2, py: 1.25, textTransform: 'none', fontWeight: 700 }}
        >
          {t('profile.dangerZone')}
        </Button>
        <Collapse in={dangerOpen}>
          <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t('profile.dangerZoneHint')}
            </Typography>
            <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={removeAccount}>
              {t('profile.deleteAccount')}
            </Button>
          </Box>
        </Collapse>
      </Box>
    </Box>
  )
}
