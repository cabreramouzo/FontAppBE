import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import Divider from '@mui/material/Divider'
import Collapse from '@mui/material/Collapse'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Stack from '@mui/material/Stack'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ShieldIcon from '@mui/icons-material/GppMaybeOutlined'
import type { Font, MyComment } from '../api/types'
import { deleteAccount, describeError, getMyComments, getMyFavorites, getMyFonts, updateProfile } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from '../components/Skeleton'
import { waterStatusInfo } from '../lib/waterStatus'
import { esNombreValido } from '../lib/username'
import { timeAgo } from '../lib/time'
import { canModerate } from '../lib/roles'
import { GamificationCard } from '../components/GamificationCard'
import { GuardedFonts } from '../components/GuardedFonts'
import { capabilitiesEnabled } from '../lib/capabilities'

/**
 * La misma regla que `Mentions.isMentionable` en el servidor, y por eso está escrita al
 * lado de un comentario que lo dice: un nombre que aquí pase y allí no da un 400 que el
 * usuario no puede interpretar, y al revés deja crear nombres que nadie puede mencionar.
 */

export function ProfilePage() {
  const { user, loading, logout, refresh } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [fonts, setFonts] = useState<Font[] | null>(null)
  const [favorites, setFavorites] = useState<Font[] | null>(null)
  const [comments, setComments] = useState<MyComment[] | null>(null)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [dangerOpen, setDangerOpen] = useState(false)
  const [error, setError] = useState('')
  // Si los niveles no conceden nada (el sistema nace apagado), no se avisa de que
  // apagarlos te quita permisos: sería amenazar con algo que no existe.
  const [capsOn, setCapsOn] = useState(false)

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      window.location.replace('/login')
      return
    }
    getMyFonts().then(setFonts).catch(() => setFonts([]))
    getMyFavorites().then(setFavorites).catch(() => setFavorites([]))
    getMyComments().then(setComments).catch(() => setComments([]))
    capabilitiesEnabled().then(setCapsOn)
  }, [user, loading, navigate])

  function empezarEdicion() {
    setNombre(user?.name ?? '')
    setUsuario(user?.username ?? '')
    setError('')
    setEditando(true)
  }

  /**
   * Guarda nombre y usuario. Reusa `savePrivacy` porque el endpoint es uno solo y manda
   * el perfil entero: separar los dos caminos era duplicar la lista de campos y
   * garantizar que un día uno de los dos se dejara alguno por el camino.
   */
  async function guardarIdentidad(e: React.FormEvent) {
    e.preventDefault()
    const limpio = usuario.trim()
    if (!nombre.trim()) { setError(t('profile.nameEmpty')); return }
    if (!esNombreValido(limpio)) { setError(t('profile.usernameRules')); return }
    const ok = await savePrivacy({ name: nombre.trim(), username: limpio })
    if (ok) setEditando(false)
  }

  async function savePrivacy(patch: { name?: string; username?: string; emailPublic?: boolean; namePublic?: boolean; weeklyDigest?: boolean; gamificationOptOut?: boolean; mentionEmails?: boolean }): Promise<boolean> {
    if (!user) return false
    setSavingPrivacy(true)
    setError('')
    try {
      await updateProfile(user.id, {
        name: user.name,
        username: user.username,
        email: user.email ?? '',
        emailPublic: user.emailPublic ?? false,
        namePublic: user.namePublic ?? true,
        weeklyDigest: user.weeklyDigest ?? true,
        gamificationOptOut: user.gamificationOptOut ?? false,
        mentionEmails: user.mentionEmails ?? true,
        ...patch,
      })
      await refresh() // refresca el usuario para reflejar el nuevo estado
      return true
    } catch (e) {
      setError(describeError(e, t))
      return false
    } finally {
      setSavingPrivacy(false)
    }
  }

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

  if (!user) return null

  return (
    <Box className="pad profile" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{t('nav.profile')}</Typography>

      {canModerate(user) && (
        <Button
          component={RouterLink}
          to="/admin"
          variant="outlined"
          startIcon={<ShieldIcon />}
          sx={{ mb: 2 }}
        >
          {t('admin.title')}
        </Button>
      )}

      <Box
        component="section"
        sx={{ mb: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56, fontSize: 22 }}>{initials(user.name)}</Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{user.name}</Typography>
          <Typography color="text.secondary">@{user.username}</Typography>
          {user.email && <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>}
        </Box>
        {!editando && (
          <Button size="small" startIcon={<EditIcon />} onClick={empezarEdicion} sx={{ flexShrink: 0 }}>
            {t('form.edit')}
          </Button>
        )}
      </Box>

      {/* Nombre y usuario, editables. El backend ya lo permitía desde siempre —
          `PUT /users/:id` manda los dos— pero no había por dónde: quien se dejaba una
          errata al registrarse se quedaba con ella para siempre. */}
      {editando && (
        <Box
          component="form"
          onSubmit={guardarIdentidad}
          sx={{ mb: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}
        >
          <TextField
            label={t('profile.name')} value={nombre} onChange={(e) => setNombre(e.target.value)}
            size="small" fullWidth sx={{ mb: 1.5 }} slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label={t('profile.username')} value={usuario} onChange={(e) => setUsuario(e.target.value)}
            size="small" fullWidth
            slotProps={{ htmlInput: { maxLength: 30, autoCapitalize: 'none', spellCheck: false } }}
            error={!!usuario && !esNombreValido(usuario)}
            helperText={t('profile.usernameRules')}
          />
          {/* Cambiar de nombre no es gratis y conviene decirlo ANTES, no en un error
              después: el enlace a tu perfil es `/users/<nombre>`, así que el viejo deja
              de funcionar y las menciones ya escritas apuntan a donde ya no estás. */}
          <Alert severity="info" sx={{ mt: 1.5 }}>{t('profile.usernameWarning')}</Alert>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button type="submit" variant="contained" disableElevation size="small" disabled={savingPrivacy}>
              {t('form.save')}
            </Button>
            <Button size="small" onClick={() => setEditando(false)} disabled={savingPrivacy}>
              {t('form.cancel')}
            </Button>
          </Stack>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('privacy.title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('privacy.intro')}
        </Typography>
        <FormControlLabel
          control={<Switch checked={user.namePublic ?? true} disabled={savingPrivacy} onChange={(e) => savePrivacy({ namePublic: e.target.checked })} />}
          label={t('privacy.namePublic')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {t('privacy.namePublicHint')}
        </Typography>
        <FormControlLabel
          control={<Switch checked={!!user.emailPublic} disabled={savingPrivacy} onChange={(e) => savePrivacy({ emailPublic: e.target.checked })} />}
          label={t('privacy.emailPublic')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('privacy.emailPublicHint')}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <Link component={RouterLink} to={`/users/${encodeURIComponent(user.username)}`}>
            {t('privacy.viewPublic')}
          </Link>
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('notif.title')}</Typography>
        <FormControlLabel
          control={<Switch checked={user.weeklyDigest ?? true} disabled={savingPrivacy} onChange={(e) => savePrivacy({ weeklyDigest: e.target.checked })} />}
          label={t('notif.weekly')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('notif.weeklyHint')}
        </Typography>
        {/* Nace encendido: una mención suele ser alguien hablándote de algo tuyo, y un
            aviso que solo llega si lo activaste antes no llega nunca. El interruptor
            está aquí, y el propio correo lleva su enlace de baja para quien no tenga
            la sesión abierta. */}
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Switch checked={user.mentionEmails ?? true} disabled={savingPrivacy} onChange={(e) => savePrivacy({ mentionEmails: e.target.checked })} />}
          label={t('notif.mentions')}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {t('notif.mentionsHint')}
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {!user.gamificationOptOut && <GamificationCard />}

      {/* Va después del marcador y antes de los interruptores: es lo accionable de esta
          pantalla. Y **no** depende de `gamificationOptOut` — cuidar una fuente no es
          puntuar, y quien apagó los puntos sigue queriendo saber qué se le está
          quedando viejo. */}
      <GuardedFonts />

      {/* El interruptor va DESPUÉS del marcador: decidir sobre las gotas antes de haber
          visto ninguna no significa nada. Y queda fuera de la tarjeta a propósito, para
          que apagarlo no esconda también la forma de volver a encenderlo.

          Se enuncia en positivo —«compartir», encendido— y no como «ocultar», apagado.
          La preferencia guardada sigue siendo `gamificationOptOut` y su valor por defecto
          sigue siendo `false`: lo que cambia es solo cómo se lee. Un interruptor negativo
          en reposo obliga a resolver una doble negación para responder a la única pregunta
          que importa aquí, que es si los demás te ven el nivel o no. */}
      <Box component="section" sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={!(user.gamificationOptOut ?? false)}
              disabled={savingPrivacy}
              onChange={(e) => savePrivacy({ gamificationOptOut: !e.target.checked })}
            />
          }
          label={t('game.share')}
        />
        {/* Tres frases y no una porque el interruptor mueve tres cosas distintas, y la
            que decía «solo dejas de ver el marcador» era falsa: también te borra de lo
            que ven los demás y, si los permisos están activos, te los quita. Quien lo
            apaga está tomando una decisión sobre su privacidad y necesita saber qué
            sigue siendo público —sus fuentes y reseñas lo son— y qué no. */}
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, color: 'text.secondary' }}>
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {t('game.shareKeeps')}
          </Typography>
          <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
            {t('game.shareOffHides')}
          </Typography>
          {capsOn && (
            <Typography component="li" variant="caption" sx={{ display: 'list-item' }}>
              {t('game.shareOffCaps')}
            </Typography>
          )}
        </Box>
      </Box>

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.myFavorites')}</Typography>
        {favorites === null && <Skeleton lines={2} />}
        {favorites?.length === 0 && <Typography color="text.secondary">{t('profile.noFavorites')}</Typography>}
        <List disablePadding>
          {favorites?.map((f) => (
            <ListItem key={f.id} disablePadding divider>
              <ListItemButton component={RouterLink} to={`/fonts/${f.id}`}>
                <ListItemText primary={f.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('profile.myFonts')}</Typography>
        {fonts === null && <Skeleton lines={2} />}
        {fonts?.length === 0 && <Typography color="text.secondary">{t('profile.noFonts')}</Typography>}
        <List disablePadding>
          {fonts?.map((f) => (
            <ListItem key={f.id} disablePadding divider>
              <ListItemButton component={RouterLink} to={`/fonts/${f.id}`}>
                <ListItemText primary={f.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box component="section">
        <Typography variant="h6" gutterBottom>{t('profile.myReviews')}</Typography>
        {comments === null && <Skeleton lines={3} />}
        {comments?.length === 0 && <Typography color="text.secondary">{t('profile.noReviews')}</Typography>}
        <List disablePadding>
          {comments?.map((c) => {
            const ws = waterStatusInfo(c.waterStatus)
            return (
              <ListItem key={c.id} divider alignItems="flex-start" sx={{ display: 'block', py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Link component={RouterLink} to={`/fonts/${c.fontID}`} sx={{ fontWeight: 600 }}>{c.fontName ?? '—'}</Link>
                  {ws && <Chip size="small" label={`${ws.emoji} ${t(`status.${ws.key}`)}`} />}
                  <Typography variant="caption" color="text.secondary">· {c.createdAt ? timeAgo(c.createdAt, t) : ''}</Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 0.5 }}>{c.body}</Typography>
              </ListItem>
            )
          })}
        </List>
      </Box>

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

/// Iniciales para el avatar: primeras letras de las dos primeras palabras.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
