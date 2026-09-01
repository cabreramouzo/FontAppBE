import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/SearchOutlined'
import { nearbyFonts } from '../api/client'
import type { Font, FontSummary } from '../api/types'
import { haversineKm } from '../lib/geo'
import { nombreFuente } from '../lib/fontName'
import { useI18n } from '../i18n/I18nContext'

/**
 * «¿Cuál de las de al lado es?» — el selector de fuente vecina.
 *
 * Se extrajo del bloque de mantenimiento cuando hizo falta el mismo diálogo para que
 * **cualquiera pueda señalar** un duplicado sin poder decidirlo. Copiarlo habría sido lo
 * rápido y las dos listas se separan al primer arreglo: los metros, el orden, el filtro y
 * el «no hay vecinas» tienen que decir lo mismo en las dos puertas, porque son la misma
 * pregunta hecha por dos personas distintas.
 *
 * Se abre directamente con las vecinas ordenadas por distancia y no con un campo de
 * búsqueda vacío: un duplicado está, por definición, a unos metros. En el caso normal no
 * hay que escribir nada — la buena es la primera o la segunda. El filtro es para el raro.
 */
export function ElegirFuenteCercana({ font, open, titulo, ayuda, ocupado, onClose, onElegir }: {
  font: Font
  open: boolean
  titulo: string
  ayuda: string
  ocupado?: boolean
  onClose: () => void
  onElegir: (id: string) => void
}) {
  const { t } = useI18n()
  const [cercanas, setCercanas] = useState<FontSummary[] | null>(null)
  const [filtro, setFiltro] = useState('')

  // Las vecinas se piden al abrir, no antes: casi nadie señala duplicados y esta petición
  // no tiene por qué pagarla toda visita a una ficha.
  useEffect(() => {
    if (!open || cercanas) return
    nearbyFonts(font.latitude, font.longitude)
      .then((fs) => setCercanas(fs.filter((f) => f.id !== font.id)))
      .catch(() => setCercanas([]))
  }, [open, cercanas, font.id, font.latitude, font.longitude])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{ayuda}</Typography>
        <TextField
          fullWidth size="small" value={filtro} onChange={(e) => setFiltro(e.target.value)}
          placeholder={t('maint.filterByName')}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            },
          }}
        />
        {cercanas === null && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>…</Typography>
        )}
        {cercanas?.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {t('maint.noNeighbours')}
          </Typography>
        )}
        <List dense sx={{ maxHeight: 320, overflowY: 'auto' }}>
          {(cercanas ?? [])
            .filter((f) => !filtro || nombreFuente(f, t).toLowerCase().includes(filtro.toLowerCase()))
            .map((f) => {
              const m = haversineKm(font.latitude, font.longitude, f.latitude, f.longitude) * 1000
              return (
                <ListItemButton key={f.id} disabled={ocupado} onClick={() => onElegir(f.id)}>
                  <ListItemText
                    primary={nombreFuente(f, t)}
                    // Los metros son el dato que decide: a 8 m es casi seguro la misma
                    // agua, a 800 m casi seguro que no.
                    secondary={m < 1000 ? t('maint.metresAway', { n: String(Math.round(m)) })
                                        : t('maint.kmAway', { n: (m / 1000).toFixed(1) })}
                    slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                  />
                </ListItemButton>
              )
            })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('form.cancel')}</Button>
      </DialogActions>
    </Dialog>
  )
}
