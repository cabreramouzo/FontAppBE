import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import Typography from '@mui/material/Typography'
import { Confetti } from './Confetti'
import { getStats, type Stats } from '../api/client'
import { useI18n } from '../i18n/I18nContext'

/**
 * El easter egg del logo: siete toques a 💧 FontApp → llueven gotas y sale el número de
 * fuentes cartografiadas. Escondido pero descubrible, como el tap del número de versión en
 * Android, y coherente con la casa: celebra el dato del que va la app.
 *
 * La cifra viene de `GET /stats` (cacheada), y se dice con la mitad honesta —cuántas ha
 * comprobado alguien— que es justo lo que invita a aportar. Se cierra al tocar o solo a
 * los seis segundos. Con `prefers-reduced-motion` el confeti no cae (lo decide él), pero
 * el cartel con la cifra sale igual.
 */
export function EasterEggFuentes(
  { abierto, onClose, precargado }: { abierto: boolean; onClose: () => void; precargado?: Stats | null },
) {
  const { t, lang } = useI18n()
  const [stats, setStats] = useState<Stats | null>(precargado ?? null)
  // Momento de apertura: un margen para que el toque reflejo justo después del séptimo no
  // la cierre de golpe (era el «al 8º se quita»). Pasado ese margen, tocar sí cierra.
  const abiertoEn = useRef(0)

  useEffect(() => {
    if (!abierto) return
    abiertoEn.current = Date.now()
    let vivo = true
    // Si ya venía precargada (se pidió en el primer toque), no se vuelve a pedir.
    if (!precargado) void getStats().then((s) => { if (vivo) setStats(s) }).catch(() => {})
    else setStats(precargado)
    const timer = window.setTimeout(onClose, 6000)
    return () => { vivo = false; window.clearTimeout(timer) }
  }, [abierto, onClose, precargado])

  if (!abierto) return null
  const nf = new Intl.NumberFormat(lang)
  const cerrarSiToca = () => { if (Date.now() - abiertoEn.current > 1200) onClose() }
  return (
    <>
      <Confetti activo forma="gotas" />
      <Box
        onClick={cerrarSiToca}
        sx={{
          position: 'fixed', inset: 0, zIndex: 2001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Fade in appear>
          <Box sx={{
            bgcolor: 'background.paper', borderRadius: 3, boxShadow: 6,
            px: 3, py: 2.5, mx: 2, textAlign: 'center', maxWidth: 320,
          }}>
            <Typography sx={{ fontSize: 40, lineHeight: 1 }} aria-hidden>💧</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
              {stats ? nf.format(stats.total) : '…'}
            </Typography>
            <Typography variant="body2" color="text.secondary">{t('egg.fountains')}</Typography>
            {stats && stats.checked > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                {t('egg.checked', { n: nf.format(stats.checked) })}
              </Typography>
            )}
          </Box>
        </Fade>
      </Box>
    </>
  )
}
