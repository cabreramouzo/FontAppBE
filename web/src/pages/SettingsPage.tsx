import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Collapse from '@mui/material/Collapse'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { deleteAccount, deletePasskey, describeError, listPasskeys, registerPasskey, updateProfile, type PasskeySummary } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { esNombreValido, pareceCorreo } from '../lib/username'
import { capabilitiesEnabled } from '../lib/capabilities'
import { EspacioEnElMovil } from '../components/EspacioEnElMovil'
import { AvisosDelSistema } from '../components/AvisosDelSistema'

/**
 * Ajustes: privacidad, avisos, compartir el nivel y la cuenta.
 *
 * **Existe porque `/me` eran dos páginas mezcladas.** Los ajustes salían en TRES islas
 * separadas por contenido (privacidad y avisos arriba, el interruptor del nivel en medio,
 * la zona de peligro al final), y eso —no la cantidad de información— es lo que se leía
 * como caos. Además iban primero: había que pasar por delante de 446 px de interruptores
 * que se tocan una vez en la vida para llegar a lo que vas a ver, que son tus fuentes.
 * Medido antes de partirla: las favoritas no empezaban hasta 1.458 px en escritorio y
 * 1.613 en móvil.
 *
 * La regla del reparto es «un sitio donde se está» frente a «una cosa que se hace»: en
 * `/me` está lo tuyo, aquí lo que se toca. Es la misma que decide qué baja a la tab bar.
 */
export function SettingsPage() {
  const { user, loading, logout, refresh } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [dangerOpen, setDangerOpen] = useState(false)
  const [error, setError] = useState('')
  // Si los niveles no conceden nada (el sistema nace apagado), no se avisa de que
  // apagarlos te quita permisos: sería amenazar con algo que no existe.
  const [capsOn, setCapsOn] = useState(false)
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([])
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  useEffect(() => {
    if (loading) return // esperamos a que se restaure la sesión antes de decidir
    if (!user) {
      window.location.replace('/login')
      return
    }
    setNombre(user.name)
    setUsuario(user.username)
    capabilitiesEnabled().then(setCapsOn)
    if (window.PublicKeyCredential) listPasskeys().then(setPasskeys).catch(() => {})
  }, [user, loading])

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
    await savePrivacy({ name: nombre.trim(), username: limpio })
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

  async function addPasskey() {
    const label = prompt(t('passkey.namePrompt'), t('passkey.defaultLabel'))?.trim()
    if (!label) return
    setError(''); setPasskeyBusy(true)
    try {
      const key = await registerPasskey(label)
      setPasskeys((current) => [key, ...current])
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) setError(describeError(e, t))
    } finally { setPasskeyBusy(false) }
  }

  async function removePasskey(id: string) {
    if (!confirm(t('passkey.confirmDelete'))) return
    try { await deletePasskey(id); setPasskeys((current) => current.filter((key) => key.id !== id)) }
    catch (e) { setError(describeError(e, t)) }
  }

  if (loading) return null
  if (!user) return null

  // Sin cambios no hay nada que guardar: un botón siempre activo invita a pulsarlo sin
  // haber tocado nada, y aquí cambiar el nombre de usuario no es gratis.
  const identidadSucia = nombre !== user.name || usuario !== user.username

  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/me">← {t('nav.profile')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{t('settings.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{t('settings.intro')}</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Nombre y usuario. El backend ya lo permitía desde siempre —`PUT /users/:id` manda
          los dos— pero no había por dónde: quien se dejaba una errata al registrarse se
          quedaba con ella para siempre.
          Aquí los campos van **siempre visibles y editables**, sin botón de «editar»: en
          una pantalla que existe para tocar cosas, un modo de edición es un paso de más. */}
      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('settings.account')}</Typography>
        <Box component="form" onSubmit={guardarIdentidad}>
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
          {/* Dos avisos para las cuentas creadas antes de que el registro exigiera la
              regla. No se pintan casi nunca —hoy, 4 de 15 autores recientes— pero a quien
              le toca no tiene forma de enterarse por su cuenta.
              El del correo va primero y en `warning` porque es de privacidad: su
              dirección está firmando cada reseña en público, y además burla su propia
              preferencia (`emailPublic` nace apagada y el perfil sí oculta el campo). */}
          {pareceCorreo(user.username) ? (
            <Alert severity="warning" sx={{ mt: 1.5 }}>{t('profile.usernameIsEmail')}</Alert>
          ) : !esNombreValido(user.username) && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>{t('profile.usernameUnmentionable')}</Alert>
          )}
          {/* Cambiar de nombre no es gratis y conviene decirlo ANTES, no en un error
              después: el enlace a tu perfil es `/users/<nombre>`, así que el viejo deja
              de funcionar y las menciones ya escritas apuntan a donde ya no estás. */}
          {identidadSucia && <Alert severity="info" sx={{ mt: 1.5 }}>{t('profile.usernameWarning')}</Alert>}
          <Button
            type="submit" variant="contained" disableElevation size="small"
            sx={{ mt: 1.5 }} disabled={savingPrivacy || !identidadSucia}
          >
            {t('form.save')}
          </Button>
        </Box>
      </Box>

      {window.PublicKeyCredential && (
        <Box component="section" sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>{t('passkey.title')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('passkey.intro')}</Typography>
          {passkeys.map((key) => (
            <Box key={key.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
              <Typography variant="body2">{key.label}</Typography>
              <Button color="error" size="small" onClick={() => removePasskey(key.id)}>{t('detail.delete')}</Button>
            </Box>
          ))}
          <Button variant="outlined" size="small" onClick={addPasskey} disabled={passkeyBusy}>{t('passkey.add')}</Button>
        </Box>
      )}

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

        {/* Los avisos del sistema. Este interruptor NO es una preferencia de la cuenta
            sino de **este aparato**: quien los quiere en el móvil no está diciendo nada
            sobre su portátil, y el permiso lo concede el navegador, no nosotros. Por eso
            no pasa por `savePrivacy` y vive en su propio componente. */}
        <AvisosDelSistema />
      </Box>

      {/* Se enuncia en positivo —«compartir», encendido— y no como «ocultar», apagado.
          La preferencia guardada sigue siendo `gamificationOptOut` y su valor por defecto
          sigue siendo `false`: lo que cambia es solo cómo se lee. Un interruptor negativo
          en reposo obliga a resolver una doble negación para responder a la única pregunta
          que importa aquí, que es si los demás te ven el nivel o no. */}
      <Box component="section" sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>{t('game.title')}</Typography>
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

      <Divider sx={{ my: 3 }} />
      <EspacioEnElMovil />

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
