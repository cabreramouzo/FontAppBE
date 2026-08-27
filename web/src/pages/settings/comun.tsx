import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { describeError, updateProfile } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useI18n } from '../../i18n/I18nContext'

/**
 * Lo que comparten las pantallas de ajustes.
 *
 * ## Por qué el guardado vive aquí y no en cada pantalla
 *
 * `PUT /users/:id` manda el **perfil entero**, así que quien guarde un solo interruptor
 * tiene que reenviar todos los demás campos tal como están. Con una copia de esa lista en
 * cada pantalla, el día que se añada una preferencia habría que acordarse de sumarla en
 * cinco sitios — y el que se olvide **no falla**: pisa el valor guardado con el que
 * llevaba por defecto. Es exactamente el fallo silencioso que ya evitaba `savePrivacy`
 * cuando todo estaba en una sola página, y partirla no puede costarnos esa garantía.
 */
export type Ajuste = {
  name?: string; username?: string
  emailPublic?: boolean; namePublic?: boolean
  weeklyDigest?: boolean; gamificationOptOut?: boolean; mentionEmails?: boolean
  pushFontUpdates?: boolean; pushMentions?: boolean; pushAdmin?: boolean
}

export function useAjustes() {
  const { user, loading, refresh } = useAuth()
  const { t } = useI18n()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Sin sesión no hay ajustes que tocar. `replace` y no `navigate` para que el botón de
  // atrás no devuelva a una pantalla que va a volver a echarte.
  useEffect(() => {
    if (!loading && !user) window.location.replace('/login')
  }, [loading, user])

  async function guardar(patch: Ajuste): Promise<boolean> {
    if (!user) return false
    setGuardando(true)
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
        pushFontUpdates: user.pushFontUpdates ?? true,
        pushMentions: user.pushMentions ?? true,
        pushAdmin: user.pushAdmin ?? true,
        ...patch,
      })
      await refresh()
      return true
    } catch (e) {
      setError(describeError(e, t))
      return false
    } finally {
      setGuardando(false)
    }
  }

  return { user, loading, guardar, guardando, error, setError }
}

/**
 * El marco de una subpantalla de ajustes: volver, título y el hueco del error.
 *
 * El enlace de vuelta va **a los ajustes** y no a `/me`: es donde estabas.
 */
export function PantallaDeAjustes({ titulo, intro, error, children }: {
  titulo: string; intro?: string; error?: string; children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Box className="pad" sx={{ maxWidth: 720, mx: 'auto' }}>
      <Link component={RouterLink} to="/me/settings">← {t('settings.title')}</Link>
      <Typography variant="h4" sx={{ my: 1, fontWeight: 800 }}>{titulo}</Typography>
      {intro && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{intro}</Typography>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {children}
    </Box>
  )
}
