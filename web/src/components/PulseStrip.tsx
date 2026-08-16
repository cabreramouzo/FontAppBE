import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import { getPulse } from '../api/client'
import type { PulseSnapshot } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { LevelBadge } from './LevelBadge'

/**
 * La tira de competición sobre el mosaico de novedades: quién ha subido de nivel esta
 * semana y a quién le falta poco.
 *
 * Vive **aquí y no en una página propia** por una razón práctica: la gente ya entra a
 * novedades, y casi nadie entra a su perfil. Una `/competition` aparte tendría el mismo
 * problema que la vitrina de insignias —existir sin que nadie pase por delante— y encima
 * habría que resolver otra vez el mezclado por fechas que este feed ya tiene resuelto.
 *
 * Es una **tira separada y no eventos mezclados en la rejilla**, que era la otra opción.
 * La rejilla cuenta qué le ha pasado a las fuentes de tu zona y cada pieza lleva a una
 * ficha; un ascenso de nivel no tiene fuente a la que llevar, ni foto, ni encaja en el
 * `separaRepetidas`, que se apoya en el `fontID` para no repetir. Metido dentro habría
 * que inventarle una fuente falsa a cada ascenso.
 *
 * **Si no hay nada que contar, no se pinta nada.** Ni título, ni caja vacía, ni «todavía
 * nadie»: una sección permanentemente vacía enseña a saltársela, y con la app arrancando
 * lo normal las primeras semanas es que no haya ascensos.
 */
export function PulseStrip() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [data, setData] = useState<PulseSnapshot | null>(null)

  useEffect(() => {
    let vivo = true
    // Sin `catch` que avise: esto es un adorno sobre el contenido de verdad. Si falla,
    // la página de novedades tiene que seguir siendo la página de novedades.
    getPulse().then((p) => { if (vivo) setData(p) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!data || (data.promotions.length === 0 && data.climbers.length === 0)) return null

  return (
    <Box
      component="section"
      sx={{
        mb: 2.5, p: { xs: 1.5, sm: 2 }, borderRadius: 2,
        border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover',
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, alignItems: 'center' }}>
        <TrendingUpIcon fontSize="small" color="primary" />
        {/* La aclaración va en el título porque es donde nace la duda: el resto de la
            página está filtrado por zona y esto no, así que aquí sale gente de fuera. */}
        <Tooltip title={t('pulse.hint')}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, cursor: 'help' }}>{t('pulse.title')}</Typography>
        </Tooltip>
      </Stack>

      {/* Dos columnas solo si hay dos listas. Lo normal al principio es que haya una
          sola, y con `1fr 1fr` fijo la caja se queda medio vacía a la derecha — parece
          que falta algo por cargar. */}
      <Box
        sx={{
          display: 'grid', gap: { xs: 2, sm: 3 },
          gridTemplateColumns: {
            xs: '1fr',
            sm: data.promotions.length > 0 && data.climbers.length > 0 ? '1fr 1fr' : '1fr',
          },
        }}
      >
        {data.promotions.length > 0 && (
          <Columna titulo={t('pulse.promoted')}>
            {data.promotions.map((p) => (
              <Stack key={p.username} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {/* Sin `placeholder`: en una tira estrecha, un disco de relleno por cada
                    nivel todavía sin dibujar ocupa lo mismo que la insignia de verdad y
                    no aporta nada. Que se caiga y quede solo el texto. */}
                <LevelBadge levelKey={p.level} size={34} />
                <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
                  <Quien username={p.username} yo={user?.username} />{' '}
                  {t('pulse.reached', { level: t(`game.level.${p.level}`) })}
                </Typography>
              </Stack>
            ))}
          </Columna>
        )}

        {data.climbers.length > 0 && (
          <Columna titulo={t('pulse.climbers')}>
            {data.climbers.map((c) => (
              <Box key={c.username}>
                <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
                  <Quien username={c.username} yo={user?.username} />{' '}
                  {t('pulse.needs', { n: String(c.remaining), level: t(`game.level.${c.nextLevel}`) })}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={c.pct}
                  sx={{
                    height: 5, borderRadius: 3, mt: 0.5,
                    // Igual que en la vitrina y en las barras de zona: el carril por
                    // defecto es un azul saturado y una barra a medias se lee como llena.
                    bgcolor: 'action.selected',
                    '& .MuiLinearProgress-bar': { borderRadius: 3 },
                  }}
                />
              </Box>
            ))}
          </Columna>
        )}
      </Box>
    </Box>
  )
}

function Columna({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}
      >
        {titulo}
      </Typography>
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  )
}

/**
 * El nombre, enlazado al perfil público. Si eres tú, se dice: verse en una lista pública
 * es justo lo que se busca aquí, y con el nombre a secas cuesta un momento darse cuenta.
 */
function Quien({ username, yo }: { username: string; yo?: string }) {
  const { t } = useI18n()
  const soyYo = !!yo && yo === username
  return (
    <>
      <Link
        component={RouterLink}
        to={`/users/${encodeURIComponent(username)}`}
        sx={{ fontWeight: 700 }}
      >
        @{username}
      </Link>
      {soyYo && <Typography component="span" variant="body2" color="primary" sx={{ fontWeight: 700 }}> ({t('pulse.mine')})</Typography>}
    </>
  )
}
