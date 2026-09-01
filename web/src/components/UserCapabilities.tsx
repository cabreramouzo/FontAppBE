import { useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import { describeError, getUserCapabilities } from '../api/client'
import type { UserCapabilityReport } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

/**
 * «¿Qué puede hacer esta persona, y por qué no puede el resto?», para el panel.
 *
 * Nace de un caso de soporte que se contestó mal: alguien avisó de que la app le pedía
 * un nivel que ya tenía, y desde el panel **no había forma de comprobarlo**. Los dos
 * requisitos que de verdad le bloqueaban —los días distintos con aportación y una
 * anulación contada como mala conducta— solo se veían entrando por SSH a la base de
 * datos, así que en la práctica se contestaba de memoria.
 *
 * Lo que enseña está elegido por esa pregunta: no es un perfil, es un **expediente de
 * permisos**. Nada de correo ni de ubicación de registro — eso vive en `/admin/users`,
 * que es de owner por llevar datos personales; esto es de admin porque no lleva ninguno.
 */
export function UserCapabilities() {
  const { t, lang } = useI18n()
  const [nombre, setNombre] = useState('')
  const [informe, setInforme] = useState<UserCapabilityReport | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const q = nombre.trim()
    if (!q) return
    setError(''); setCargando(true)
    try {
      setInforme(await getUserCapabilities(q))
    } catch (err) {
      setInforme(null)
      setError(describeError(err, t))
    } finally {
      setCargando(false)
    }
  }

  const n = (x: number) => x.toLocaleString(lang)

  return (
    <Box>
      <Typography variant="h6" gutterBottom>🔑 {t('admin.caps.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('admin.caps.hint')}</Typography>

      <Stack component="form" direction="row" spacing={1} onSubmit={buscar} sx={{ mb: 2 }}>
        <TextField
          size="small" value={nombre} onChange={(e) => setNombre(e.target.value)}
          label={t('admin.caps.search')} sx={{ flex: 1, maxWidth: 320 }}
        />
        <Button type="submit" variant="outlined" disabled={cargando || !nombre.trim()}>
          {t('admin.caps.lookUp')}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {informe && <InformeDeCapacidades r={informe} n={n} />}
    </Box>
  )
}

function InformeDeCapacidades({ r, n }: { r: UserCapabilityReport; n: (x: number) => string }) {
  const { t } = useI18n()
  const diasCortos = r.activeDays < r.requiredActiveDays

  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800 }}>@{r.username}</Typography>
        {r.role !== 'user' && <Chip size="small" color="secondary" label={t(`role.${r.role}`)} />}
        <Chip size="small" label={t(`game.level.${r.level}`)} />
      </Box>

      <Typography variant="body2" color="text.secondary">
        {t('admin.caps.gotes', { n: n(r.gotes) })}
        {r.pendingGotes > 0 && ` · ${t('admin.caps.pending', { n: n(r.pendingGotes) })}`}
      </Typography>

      {/* Los días son la mitad del requisito que nadie miraba, y por eso van en grande y
          con color: es lo que contestaba la pregunta del caso real. */}
      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: diasCortos ? 700 : 400 }}
                  color={diasCortos ? 'warning.main' : 'text.secondary'}>
        {t('admin.caps.days', { have: n(r.activeDays), need: n(r.requiredActiveDays) })}
      </Typography>

      {/* El estado del sistema, antes que el de la persona: con las capacidades apagadas,
          «no puede nada» no dice nada de ella. */}
      {!r.capabilitiesEnabled && <Alert severity="info" sx={{ mt: 1.5 }}>{t('admin.caps.systemOff')}</Alert>}
      {r.capabilitiesEnabled && !r.definitivePoints && (
        <Alert severity="info" sx={{ mt: 1.5 }}>{t('admin.caps.provisional')}</Alert>
      )}
      {r.gamificationOptOut && <Alert severity="info" sx={{ mt: 1.5 }}>{t('admin.caps.optedOut')}</Alert>}
      {r.postingRestrictedUntil && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {t('admin.caps.restricted', { date: new Date(r.postingRestrictedUntil).toLocaleDateString() })}
        </Alert>
      )}

      <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>{t('admin.caps.can')}</Typography>
      {r.granted.length === 0
        ? <Typography variant="body2" color="text.secondary">{t('admin.caps.canNothing')}</Typography>
        : (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            {r.granted.map((k) => (
              <Chip key={k} size="small" color="success" icon={<CheckCircleIcon />} label={t(`game.can.${k}`)} />
            ))}
          </Stack>
        )}

      <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>{t('admin.caps.cannot')}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
        {r.missing.map((m) => (
          <Chip
            key={m.key} size="small" variant="outlined" icon={<LockIcon />}
            label={`${t(`game.can.${m.key}`)} — ${m.missingGotes > 0
              ? t('admin.caps.needsGotes', { level: t(`game.level.${m.level}`), n: n(m.missingGotes) })
              : t('admin.caps.needsOnlyOther')}`}
          />
        ))}
      </Stack>

      <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>{t('admin.caps.voids')}</Typography>
      {r.recentVoids.length === 0
        ? <Typography variant="body2" color="text.secondary">{t('admin.caps.voidsNone')}</Typography>
        : (
          <Stack sx={{ mt: 0.5, gap: 0.5 }}>
            {r.recentVoids.map((v) => (
              <Typography key={v.reason} variant="body2">
                {n(v.count)} × {v.reason}{' '}
                <Typography component="span" variant="body2"
                            color={v.misconduct ? 'error.main' : 'text.secondary'}>
                  ({v.misconduct ? t('admin.caps.misconduct') : t('admin.caps.notMisconduct')})
                </Typography>
              </Typography>
            ))}
          </Stack>
        )}
    </Box>
  )
}
