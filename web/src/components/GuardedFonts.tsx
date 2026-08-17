import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import ShieldMoonIcon from '@mui/icons-material/ShieldOutlined'
import { guardedFonts, type Guarded } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { Skeleton } from './Skeleton'
import { WorthChip } from './WorthChip'

/** Cuántas se listan antes de plegar. Es un recordatorio, no un inventario. */
const VISIBLES = 6

/**
 * «Las fuentes que cuidas»: aquellas cuya última reseña es tuya.
 *
 * ## Qué problema resuelve
 *
 * La app no tenía ningún motivo **recurrente** para volver. Los puntos premian aportar,
 * pero aportar exige encontrar algo nuevo, y lo nuevo se acaba cerca de casa. Esto da una
 * razón que no se agota: lo que ya contaste caduca solo.
 *
 * Es a propósito el sustituto de una racha. Una racha castiga a quien le llueve dos fines
 * de semana y empuja a reseñas de paso para no romperla. Esto no castiga nada — las
 * olvidadas salen primero y sin números rojos — y además es **verdad**: si nadie vuelve,
 * la información que diste deja de servir y la fuente vuelve a ser un punto mudo.
 *
 * No es una propiedad, es un relevo: en cuanto otra persona reseña después, la fuente pasa
 * a ser suya. Por eso no hay ningún gesto para «adoptar» ni para «soltar».
 */
export function GuardedFonts() {
  const { t } = useI18n()
  const [fuentes, setFuentes] = useState<Guarded[] | null>(null)
  const [todas, setTodas] = useState(false)

  useEffect(() => { guardedFonts().then(setFuentes).catch(() => setFuentes([])) }, [])

  if (fuentes === null) return <Skeleton lines={3} />
  // Sin ninguna no se pinta: a quien todavía no ha reseñado nada, una sección vacía
  // titulada «las fuentes que cuidas» solo le dice que no cuida ninguna.
  if (fuentes.length === 0) return null

  const viejas = fuentes.filter((f) => f.stale)
  const lista = todas ? fuentes : fuentes.slice(0, VISIBLES)

  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <ShieldMoonIcon fontSize="small" /> {t('guard.title')}
      </Typography>
      {/* El resumen antes de la lista: lo que hay que saber es cuántas se han quedado
          viejas, no cuántas hay en total. */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {viejas.length > 0
          ? t('guard.summaryStale', { n: String(fuentes.length), s: String(viejas.length) })
          : t('guard.summaryAllFresh', { n: String(fuentes.length) })}
      </Typography>

      <List disablePadding>
        {lista.map((f) => (
          <ListItem key={f.fontID} disablePadding divider>
            <ListItemButton component={RouterLink} to={`/fonts/${f.fontID}`}>
              <ListItemText
                primary={f.name}
                secondary={
                  <>
                    {t('guard.checkedAgo', { d: String(f.days) })}{' '}
                    <WorthChip lastCheck={f.lastCheck} />
                  </>
                }
                slotProps={{ primary: { sx: { fontWeight: f.stale ? 700 : 400 } } }}
              />
              {f.stale && (
                <Chip size="small" color="warning" variant="outlined" label={t('guard.stale')} sx={{ height: 20 }} />
              )}
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {fuentes.length > VISIBLES && (
        <Typography
          component="button" variant="body2"
          onClick={() => setTodas((v) => !v)}
          sx={{ mt: 1, background: 'none', border: 0, p: 0, color: 'primary.main', cursor: 'pointer' }}
        >
          {todas ? t('guard.showLess') : t('guard.showAll', { n: String(fuentes.length) })}
        </Typography>
      )}
    </Box>
  )
}
