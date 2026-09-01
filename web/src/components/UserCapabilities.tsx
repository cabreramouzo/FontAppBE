import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import { describeError, getUserCapabilities, searchMentions } from '../api/client'
import type { UserCapabilityReport } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { abrePorRol, motivosDe, requisitosGenerales } from '../lib/capabilityBlockers'
import type { Motivo } from '../lib/capabilityBlockers'

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
/** Lo que se espera desde la última tecla antes de preguntar. */
const ESPERA_MS = 250

export function UserCapabilities() {
  const { t, lang } = useI18n()
  const [nombre, setNombre] = useState('')
  const [sugerencias, setSugerencias] = useState<string[]>([])
  const [informe, setInforme] = useState<UserCapabilityReport | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  // Una respuesta vieja no puede pisar a una nueva: se teclea más rápido de lo que
  // contesta la red y las respuestas no vuelven en orden. Es el mismo número de secuencia
  // que usa el mapa con `/fonts/map`.
  const turno = useRef(0)

  // Sugerir nombres, porque acordarse de si era `Dani_Ccir` o `dani_ccir` es imposible y
  // el informe se pide por nombre. Reutiliza `/mentions`, que ya existe, ya pide sesión y
  // ya devuelve **solo el nombre**: no hacía falta ninguna ruta nueva ni exponer nada más.
  useEffect(() => {
    const q = nombre.trim()
    // El mínimo lo pone el servidor (2). Escribirlo aquí sería tener la misma regla en
    // dos sitios, y la nuestra se quedaría vieja el día que allí cambie.
    if (q.length < 2) { setSugerencias([]); return }
    const mio = ++turno.current
    const id = setTimeout(() => {
      searchMentions(q)
        .then((nombres) => { if (mio === turno.current) setSugerencias(nombres) })
        .catch(() => { if (mio === turno.current) setSugerencias([]) })
    }, ESPERA_MS)
    return () => clearTimeout(id)
  }, [nombre])

  async function mira(q: string) {
    if (!q.trim()) return
    setError(''); setCargando(true)
    try {
      setInforme(await getUserCapabilities(q.trim()))
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

      <Stack component="form" direction="row" spacing={1} sx={{ mb: 2 }}
             onSubmit={(e) => { e.preventDefault(); void mira(nombre) }}>
        <Autocomplete
          freeSolo
          // `freeSolo` porque la lista no lo cubre todo: las cuentas anonimizadas no
          // salen en `/mentions` y aquí también se puede pegar un UUID. Sin él, escribir
          // algo que no está sugerido dejaría de poder consultarse.
          options={sugerencias}
          filterOptions={(x) => x}  // filtra el servidor; volver a filtrar aquí escondería resultados
          inputValue={nombre}
          onInputChange={(_, v) => setNombre(v)}
          // Elegir de la lista consulta al momento: quien ha encontrado el nombre ya ha
          // dicho lo que quería, y pedirle además un clic en «Mirar» es un paso de más.
          onChange={(_, v) => { if (typeof v === 'string') { setNombre(v); void mira(v) } }}
          sx={{ flex: 1, maxWidth: 320 }}
          renderInput={(params) => <TextField {...params} size="small" label={t('admin.caps.search')} />}
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

/** Los motivos, en una frase corta que quepa dentro de un chip. */
function textoDeLosMotivos(ms: Motivo[], t: (k: string, p?: Record<string, string | number>) => string,
                           n: (x: number) => string): string {
  return ms.map((m) => {
    switch (m.clave) {
      case 'days': return t('admin.caps.why.days', { n: n(m.faltan) })
      case 'gotes': return t('admin.caps.needsGotes', { level: t(`game.level.${m.level}`), n: n(m.faltan) })
      default: return t(`admin.caps.why.${m.clave}`)
    }
  }).join(' · ')
}

/** Sin motivos que dar —no debería pasar— el chip se queda con el nombre a secas, que es
 *  mejor que un guion suelto al final. */
function etiquetaDeCapacidad(nombre: string, motivos: string): string {
  return motivos ? `${nombre} — ${motivos}` : nombre
}

function InformeDeCapacidades({ r, n }: { r: UserCapabilityReport; n: (x: number) => string }) {
  const { t } = useI18n()

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

      {/* Los requisitos GENERALES van una sola vez y arriba, porque cierran todo a la
          vez: repetir «le faltan seis días» en siete chips es ruido. El motivo concreto
          de cada capacidad va después, en su chip. */}
      {abrePorRol(r.role) ? (
        <Alert severity="info" sx={{ mt: 2 }}>{t('admin.caps.byRole')}</Alert>
      ) : (
        <>
          <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>{t('admin.caps.requirements')}</Typography>
          <Stack sx={{ mt: 0.5, gap: 0.25 }}>
            {requisitosGenerales(r).map((q) => (
              <Typography key={q.clave} variant="body2"
                          color={q.cumple ? 'text.secondary' : 'warning.main'}
                          sx={{ fontWeight: q.cumple ? 400 : 700 }}>
                {q.cumple ? '✓' : '✗'} {t(`admin.caps.req.${q.clave}`, q.detalle)}
              </Typography>
            ))}
          </Stack>
        </>
      )}

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

      {/* Cada chip cerrado dice SU motivo. Antes ponía «falla otro requisito», que es
          saber que algo falla y no cuál — o sea, el administrador seguía sin poder
          contestar el correo. */}
      <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>{t('admin.caps.cannot')}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
        {r.missing.map((m) => (
          <Chip
            key={m.key} size="small" variant="outlined" icon={<LockIcon />}
            label={etiquetaDeCapacidad(t(`game.can.${m.key}`), textoDeLosMotivos(motivosDe(m, r), t, n))}
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
