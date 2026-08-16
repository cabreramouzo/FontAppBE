import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import CloseIcon from '@mui/icons-material/Close'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import NoPhotographyOutlinedIcon from '@mui/icons-material/NoPhotographyOutlined'
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined'
import { getMissions } from '../api/client'
import type { Missions, MissionTarget } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from './Skeleton'
import { askPosition, positionIfAllowed } from '../lib/quietPosition'

/**
 * Las rutas propuestas alrededor de ti. Fase 4 del plan (docs/gamificacion.md).
 *
 * Es una **ruta**, no una lista de tareas: las paradas van ordenadas por distancia y no
 * por lo que valen. Si se ordenaran por puntos, la primera estaría a 300 m y la segunda a
 * 3 km, y nadie la haría.
 *
 * La posición solo se pide sola si el permiso ya estaba dado, igual que hace el mapa al
 * abrirse. Abrir este panel no es motivo para lanzar el diálogo del navegador a bocajarro;
 * el botón «usa mi ubicación» sí, porque es un gesto del usuario.
 */
export function MissionsPanel({
  open,
  onClose,
  onFocus,
  center,
}: {
  open: boolean
  onClose: () => void
  /** Centra el mapa en una parada y la selecciona. */
  onFocus: (t: MissionTarget) => void
  /** Punto de partida, si el mapa ya sabe dónde está el usuario. */
  center: [number, number] | null
}) {
  const { t } = useI18n()
  const [data, setData] = useState<Missions | null>(null)
  const [estado, setEstado] = useState<'idle' | 'loading' | 'error' | 'noPos'>('idle')

  const cargar = useCallback(async (desde: [number, number]) => {
    setEstado('loading')
    try {
      setData(await getMissions(desde[0], desde[1]))
      setEstado('idle')
    } catch {
      setEstado('error')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let vivo = true
    ;(async () => {
      const desde = center ?? (await positionIfAllowed())
      if (!vivo) return
      if (!desde) { setEstado('noPos'); return }
      await cargar(desde)
    })()
    return () => { vivo = false }
  }, [open, center, cargar])

  async function pedirUbicacion() {
    setEstado('loading')
    const p = await askPosition()
    if (!p) { setEstado('noPos'); return }
    await cargar(p)
  }

  const rutas: { key: string; icon: React.ReactNode; title: string; hint: string; stops: MissionTarget[] }[] = [
    {
      key: 'photoless',
      icon: <NoPhotographyOutlinedIcon fontSize="small" />,
      title: t('mission.blindRoute'),
      hint: t('mission.blindRouteHint'),
      stops: data?.photoless ?? [],
    },
    {
      key: 'stale',
      icon: <UpdateOutlinedIcon fontSize="small" />,
      title: t('mission.summerRound'),
      hint: t('mission.summerRoundHint'),
      stops: data?.stale ?? [],
    },
  ].filter((r) => r.stops.length > 0)

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '78vh' } } }}
    >
      <Box sx={{ p: 2, pb: 'max(16px, env(safe-area-inset-bottom))' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{t('mission.title')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('mission.subtitle')}
              {data ? ` · ${t('mission.radius', { n: String(data.km) })}` : ''}
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label={t('form.cancel')} size="small"><CloseIcon /></IconButton>
        </Box>

        {estado === 'loading' && <Skeleton lines={4} />}

        {estado === 'noPos' && (
          <Box sx={{ py: 2 }}>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>{t('mission.needLocation')}</Typography>
            <Button variant="contained" startIcon={<MyLocationIcon />} onClick={pedirUbicacion}>
              {t('mission.locate')}
            </Button>
          </Box>
        )}

        {/* Un fallo de carga no se enseña como «no hay nada»: son cosas distintas y
            confundirlas hace que el usuario crea que su zona está al día cuando no lo sabemos. */}
        {estado === 'error' && (
          <Box sx={{ py: 2 }}>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>{t('mission.failed')}</Typography>
            <Button variant="outlined" onClick={() => center && cargar(center)}>{t('mission.retry')}</Button>
          </Box>
        )}

        {estado === 'idle' && data && rutas.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 2 }}>{t('mission.none')}</Typography>
        )}

        {estado === 'idle' && rutas.map((r) => (
          <Box key={r.key} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main' }}>
              {r.icon}
              <Typography sx={{ fontWeight: 700 }}>{r.title}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {r.hint}
            </Typography>
            <List disablePadding>
              {r.stops.map((s, i) => (
                <ListItem
                  key={s.id}
                  disablePadding
                  divider
                  secondaryAction={
                    // Icono y no texto: «Abrir la fuente» ocupa 130 px y los topónimos
                    // largos («Font de la Plaça de Sant Sebastià») se le metían encima.
                    <IconButton
                      component={RouterLink}
                      to={`/fonts/${s.id}`}
                      size="small"
                      edge="end"
                      aria-label={t('mission.open')}
                      title={t('mission.open')}
                    >
                      <ChevronRightIcon />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => { onFocus(s); onClose() }}>
                    <ListItemText
                      primary={`${i + 1}. ${s.name}`}
                      secondary={`${s.distanceKm.toFixed(2)} km`}
                      slotProps={{ primary: { sx: { fontWeight: 600 }, noWrap: true } }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </Box>
    </Drawer>
  )
}
