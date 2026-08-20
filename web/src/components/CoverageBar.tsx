import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useI18n } from '../i18n/I18nContext'

/**
 * Una barra de cobertura: «9 de 30 · 30 %».
 *
 * Vive aparte porque la usan dos escalas de la misma idea —la demarcación entera y tu
 * entorno— y las dos decisiones que lleva dentro (enseñar recuento *y* porcentaje, y no
 * dejar que una barra casi vacía parezca llena) tienen que valer para las dos o el
 * gráfico dice cosas distintas en la misma pantalla.
 */
export function CoverageBar({ icon, label, hint, done, total, pct, lang }: {
  icon: ReactNode
  label: string
  hint: string
  done: number
  total: number
  pct: number
  lang: string
}) {
  const { t } = useI18n()
  return (
    <Box sx={{ mb: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
        <Box sx={{ display: 'flex', color: 'text.secondary' }}>{icon}</Box>
        <Tooltip title={hint}>
          <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>{label}</Typography>
        </Tooltip>
        {/* El porcentaje y el recuento juntos: «2 %» sobre 2 622 fuentes suena a nada,
            y «52 fuentes» sin el total suena a mucho. Ninguno de los dos solo es honesto. */}
        {/* `nowrap` porque la cifra es una unidad: en la rejilla de zonas, con la tarjeta
            estrecha y en euskera —que es el idioma más largo—, se partía como
            «3.641(e)tik 5 ·» / «% 0». Quien cede es la etiqueta, que sí puede. */}
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {t('zones.ofTotal', { n: done.toLocaleString(lang), m: total.toLocaleString(lang), p: String(pct) })}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        // Un 0,4 % redondea a 0 y la barra desaparece del todo, que se lee como «esta
        // demarcación no existe». Se le deja un hilo visible mientras haya algo.
        value={Math.max(pct, done > 0 ? 1.5 : 0)}
        sx={{
          height: 8,
          borderRadius: 4,
          // El carril por defecto de MUI es el primario aclarado, un azul bastante
          // saturado: con estos porcentajes —del 0 al 2 %— la barra vacía se leía como
          // una barra LLENA, que es justo lo contrario de lo que dice el dato. Carril
          // neutro y relleno azul, o el gráfico miente de un vistazo.
          bgcolor: 'action.selected',
          '& .MuiLinearProgress-bar': { borderRadius: 4 },
        }}
      />
    </Box>
  )
}
