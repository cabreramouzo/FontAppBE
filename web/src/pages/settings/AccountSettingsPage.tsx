import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { deletePasskey, describeError, listPasskeys, registerPasskey, type PasskeySummary } from '../../api/client'
import { useI18n } from '../../i18n/I18nContext'
import { escribiendoCorreo, esNombreValido, pareceCorreo } from '../../lib/username'
import { PantallaDeAjustes, useAjustes } from './comun'

/**
 * Cómo te llamas y cómo entras.
 *
 * Las passkeys van aquí y no en una sección aparte: son lo mismo que el nombre de
 * usuario —la forma de entrar— y solas no daban para una pantalla.
 */
export function AccountSettingsPage() {
  const { t } = useI18n()
  const { user, guardar, guardando, error, setError } = useAjustes()
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([])
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    setNombre(user.name)
    setUsuario(user.username)
    void listPasskeys().then(setPasskeys).catch(() => { /* sin passkeys: no es un error */ })
  }, [user])

  if (!user) return null

  // Sin cambios no hay nada que guardar: un botón siempre activo invita a pulsarlo sin
  // haber tocado nada, y aquí cambiar el nombre de usuario no es gratis.
  const sucio = nombre !== user.name || usuario !== user.username

  async function guardarIdentidad(e: React.FormEvent) {
    e.preventDefault()
    const limpio = usuario.trim()
    if (!nombre.trim()) { setError(t('profile.nameEmpty')); return }
    if (escribiendoCorreo(limpio)) { setError(t('profile.usernameNotEmail')); return }
    if (!esNombreValido(limpio)) { setError(t('profile.usernameRules')); return }
    await guardar({ name: nombre.trim(), username: limpio })
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
    try { await deletePasskey(id); setPasskeys((c) => c.filter((k) => k.id !== id)) }
    catch (e) { setError(describeError(e, t)) }
  }

  return (
    <PantallaDeAjustes titulo={t('settings.account')} error={error}>
      {/* Los campos van siempre visibles y editables, sin botón de «editar»: en una
          pantalla que existe para tocar cosas, un modo de edición es un paso de más. */}
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
          helperText={escribiendoCorreo(usuario) ? t('profile.usernameNotEmail') : t('profile.usernameRules')}
        />
        {/* Dos avisos para las cuentas creadas antes de que el registro exigiera la regla.
            El del correo va primero y en `warning` porque es de privacidad: su dirección
            está firmando cada reseña en público. */}
        {pareceCorreo(user.username) ? (
          <Alert severity="warning" sx={{ mt: 1.5 }}>{t('profile.usernameIsEmail')}</Alert>
        ) : !esNombreValido(user.username) && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>{t('profile.usernameUnmentionable')}</Alert>
        )}
        {/* Cambiar de nombre no es gratis y conviene decirlo ANTES, no en un error
            después: el enlace a tu perfil es `/users/<nombre>`. */}
        {sucio && <Alert severity="info" sx={{ mt: 1.5 }}>{t('profile.usernameWarning')}</Alert>}
        <Button type="submit" variant="contained" disableElevation size="small"
                sx={{ mt: 1.5 }} disabled={guardando || !sucio}>
          {t('form.save')}
        </Button>
      </Box>

      {window.PublicKeyCredential && (
        <Box component="section" sx={{ mt: 4 }}>
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
    </PantallaDeAjustes>
  )
}
