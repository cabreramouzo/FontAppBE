import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import HistoryIcon from '@mui/icons-material/HistoryOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LayersClearIcon from '@mui/icons-material/LayersClearOutlined'
import type { Font, FontEdit } from '../api/types'
import {
  describeError, getFontHistory, markDuplicate, retireFont, unmarkDuplicate, unretireFont,
} from '../api/client'
import { capabilities } from '../lib/capabilities'
import { useI18n } from '../i18n/I18nContext'
import { timeAgo } from '../lib/time'

/**
 * El aviso de que esta ficha ya no sale en el mapa.
 *
 * Se pinta **para todo el mundo**, no solo para quien tiene permisos: a una fuente
 * escondida se llega por un enlace viejo o por el buscador, y sin esto la ficha parecería
 * normal mientras el punto no aparece en ningún sitio. Decirlo es la mitad del sentido de
 * esconder en vez de borrar.
 */
export function FontHiddenNotice({ font }: { font: Font }) {
  const { t } = useI18n()
  if (font.duplicateOf) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>{t('hidden.duplicateTitle')}</AlertTitle>
        {t('hidden.duplicateBody')}{' '}
        <Link component={RouterLink} to={`/fonts/${font.duplicateOf}`}>{t('hidden.goToGood')}</Link>
      </Alert>
    )
  }
  if (font.retiredAt) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>{t('hidden.retiredTitle')}</AlertTitle>
        {t('hidden.retiredBody')}
      </Alert>
    )
  }
  return null
}

/**
 * Mantenimiento del mapa: lo que abren los niveles 4, 5 y 6 sobre una fuente concreta.
 *
 * Va en un bloque aparte y al final, plegado tras sus botones, porque no es para quien
 * viene a beber: es para quien mantiene. Y solo se pinta si de verdad tienes alguna de
 * las tres — un botón desactivado que nunca podrás pulsar es peor que ninguno.
 */
export function FontMaintenance({ font, onChanged }: { font: Font; onChanged: () => void }) {
  const { t } = useI18n()
  const [puedo, setPuedo] = useState<string[]>([])
  const [historial, setHistorial] = useState<FontEdit[] | null>(null)
  const [verHistorial, setVerHistorial] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [otraID, setOtraID] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => { capabilities().then((c) => setPuedo(c as string[])) }, [])

  const puedeHistorial = puedo.includes('viewFontHistory')
  const puedeDuplicar = puedo.includes('markDuplicate')
  const puedeRetirar = puedo.includes('retireFont')
  if (!puedeHistorial && !puedeDuplicar && !puedeRetirar) return null

  async function corre(accion: () => Promise<unknown>) {
    setError('')
    setOcupado(true)
    try { await accion(); onChanged() } catch (e) { setError(describeError(e, t)) } finally { setOcupado(false) }
  }

  function abreHistorial() {
    setVerHistorial((v) => !v)
    if (!historial) getFontHistory(font.id).then(setHistorial).catch(() => setHistorial([]))
  }

  return (
    <Box component="section" sx={{ mt: 3, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
        {t('maint.title')}
      </Typography>
      {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
        {puedeHistorial && (
          <Button size="small" startIcon={<HistoryIcon />} onClick={abreHistorial}>
            {t('maint.history')}
          </Button>
        )}
        {puedeDuplicar && (font.duplicateOf
          ? <Button size="small" disabled={ocupado} onClick={() => corre(() => unmarkDuplicate(font.id))}>
              {t('maint.undoDuplicate')}
            </Button>
          : <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => setDupOpen(true)}>
              {t('maint.markDuplicate')}
            </Button>)}
        {puedeRetirar && (font.retiredAt
          ? <Button size="small" disabled={ocupado} onClick={() => corre(() => unretireFont(font.id))}>
              {t('maint.undoRetire')}
            </Button>
          : <Button size="small" color="warning" startIcon={<LayersClearIcon />} disabled={ocupado}
                    onClick={() => { if (confirm(t('maint.confirmRetire'))) corre(() => retireFont(font.id)) }}>
              {t('maint.retire')}
            </Button>)}
      </Stack>

      <Collapse in={verHistorial}>
        <Box sx={{ mt: 1.5 }}>
          {historial === null && <Typography variant="caption" color="text.secondary">…</Typography>}
          {historial?.length === 0 && (
            <Typography variant="caption" color="text.secondary">{t('maint.noHistory')}</Typography>
          )}
          {historial?.map((e) => (
            <Box key={e.id} sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                {e.editorName ? `@${e.editorName}` : t('review.anon')} · {timeAgo(e.createdAt, t)}
              </Typography>
              {/* Qué cambió, campo a campo. Solo lo que cambió: una edición que tocó el
                  nombre no tiene por qué enseñar los otros cinco campos iguales. */}
              {(['name', 'description', 'source', 'drinkable'] as const)
                .filter((k) => e.before[k] !== e.after[k])
                .map((k) => (
                  <Typography key={k} variant="body2" sx={{ lineHeight: 1.35 }}>
                    <b>{t(`maint.field.${k}`)}:</b>{' '}
                    <Box component="span" sx={{ textDecoration: 'line-through', color: 'text.disabled' }}>
                      {String(e.before[k] ?? '—')}
                    </Box>{' → '}{String(e.after[k] ?? '—')}
                  </Typography>
                ))}
            </Box>
          ))}
        </Box>
      </Collapse>

      <Dialog open={dupOpen} onClose={() => setDupOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('maint.markDuplicate')}</DialogTitle>
        <DialogContent>
          {/* Se pide el id y no un buscador porque el flujo real es tener las dos fichas
              abiertas y copiar la de la buena de la barra de direcciones. Un buscador
              aquí sería otra pantalla para resolver algo que ya tienes delante. */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('maint.duplicateHelp')}
          </Typography>
          <TextField
            autoFocus fullWidth size="small" value={otraID}
            onChange={(e) => setOtraID(e.target.value.trim())}
            label={t('maint.goodFontId')} placeholder="8d315d65-…"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDupOpen(false)}>{t('form.cancel')}</Button>
          <Button
            variant="contained" disableElevation disabled={!otraID || ocupado}
            onClick={() => { setDupOpen(false); corre(() => markDuplicate(font.id, otraID)) }}
          >
            {t('form.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
