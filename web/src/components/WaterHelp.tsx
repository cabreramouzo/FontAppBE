import { useState } from 'react'
import type { ReactNode } from 'react'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import { SOURCE_EMOJI, SOURCE_OPTIONS, DRINKABLE_EMOJI, DRINKABLE_OPTIONS } from '../lib/waterType'
import { useI18n } from '../i18n/I18nContext'

/** Una fila de la leyenda: emoji, rótulo y qué significa. */
type Fila = { clave: string; emoji: string; rotulo: string; explicacion: string }

/**
 * Botón (?) con una leyenda. Los dos que hay —tipo de fuente y potabilidad— son la
 * misma caja con distinta lista, así que se pintan desde aquí y no copiados: dos
 * diálogos separados se separan de verdad al primer arreglo, y el que se olvide solo
 * se nota en uno de los dos.
 */
function BotonLeyenda({ titulo, filas, nota }: { titulo: string; filas: Fila[]; nota?: ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton size="small" onClick={() => setOpen(true)} aria-label={titulo} title={titulo}>
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogContent>
          <List disablePadding>
            {filas.map((f) => (
              <ListItem key={f.clave} disableGutters alignItems="flex-start" sx={{ py: 0.75 }}>
                <ListItemIcon sx={{ minWidth: 36, fontSize: 22, mt: 0.25 }}>{f.emoji}</ListItemIcon>
                <ListItemText
                  disableTypography
                  primary={<Typography variant="body2" sx={{ fontWeight: 700 }}>{f.rotulo}</Typography>}
                  secondary={<Typography variant="caption" color="text.secondary">{f.explicacion}</Typography>}
                />
              </ListItem>
            ))}
          </List>
          {nota}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('waterHelp.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** Botón (?) con la leyenda de tipos de fuente: qué es cada uno y qué esperar del agua. */
export function WaterTypeHelpButton() {
  const { t } = useI18n()
  return (
    <BotonLeyenda
      titulo={t('waterHelp.title')}
      filas={SOURCE_OPTIONS.map((k) => ({
        clave: k,
        emoji: SOURCE_EMOJI[k],
        rotulo: t(`source.${k}`),
        explicacion: t(`waterHelp.${k}`),
      }))}
    />
  )
}

/**
 * Botón (?) con la leyenda de potabilidad.
 *
 * Lleva «desconeguda» en la lista aunque no sea un valor de `Drinkable`: es la opción
 * que se lleva el 94 % de la base y la única que hay que distinguir a mano de «no
 * tractada» — nadie lo ha mirado, frente a sabemos que nadie la trata. Sin esa fila la
 * ayuda explicaría todo menos lo que de verdad se confunde.
 *
 * Y cierra con la nota de que ninguna fuente natural tiene garantía sanitaria, que es
 * lo que dicen los rótulos de la ACA y lo que hace entender la etiqueta de golpe.
 */
export function DrinkableHelpButton() {
  const { t } = useI18n()
  return (
    <BotonLeyenda
      titulo={t('drinkHelp.title')}
      filas={[
        ...DRINKABLE_OPTIONS.map((k) => ({
          clave: k,
          emoji: DRINKABLE_EMOJI[k],
          rotulo: t(`drink.${k}`),
          explicacion: t(`drinkHelp.${k}`),
        })),
        { clave: 'unknown', emoji: '❔', rotulo: t('detail.unknownDrink'), explicacion: t('drinkHelp.unknown') },
      ]}
      nota={
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontStyle: 'italic' }}>
          {t('drinkHelp.note')}
        </Typography>
      }
    />
  )
}
