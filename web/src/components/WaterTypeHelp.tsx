import { useState } from 'react'
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
import { SOURCE_EMOJI, SOURCE_OPTIONS } from '../lib/waterType'
import { useI18n } from '../i18n/I18nContext'

/** Botón (?) con la leyenda de tipos de fuente: qué es cada uno y qué esperar del agua. */
export function WaterTypeHelpButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton size="small" onClick={() => setOpen(true)} aria-label={t('waterHelp.title')} title={t('waterHelp.title')}>
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('waterHelp.title')}</DialogTitle>
        <DialogContent>
          <List disablePadding>
            {SOURCE_OPTIONS.map((k) => (
              <ListItem key={k} disableGutters alignItems="flex-start" sx={{ py: 0.75 }}>
                <ListItemIcon sx={{ minWidth: 36, fontSize: 22, mt: 0.25 }}>{SOURCE_EMOJI[k]}</ListItemIcon>
                <ListItemText
                  disableTypography
                  primary={<Typography variant="body2" sx={{ fontWeight: 700 }}>{t(`source.${k}`)}</Typography>}
                  secondary={<Typography variant="caption" color="text.secondary">{t(`waterHelp.${k}`)}</Typography>}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('waterHelp.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
