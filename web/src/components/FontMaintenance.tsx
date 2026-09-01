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
import Typography from '@mui/material/Typography'
import HistoryIcon from '@mui/icons-material/HistoryOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LayersClearIcon from '@mui/icons-material/LayersClearOutlined'
import ReportProblemIcon from '@mui/icons-material/ReportProblemOutlined'
import type { Font, FontEdit } from '../api/types'
import {
  describeError, getFontHistory, hideFontAbuse, markDuplicate, restoreFontAbuse, retireFont, unmarkDuplicate, unretireFont,
} from '../api/client'
import { capabilities } from '../lib/capabilities'
import { useI18n } from '../i18n/I18nContext'
import { ElegirFuenteCercana } from './ElegirFuenteCercana'
import { timeAgo } from '../lib/time'
import { useAuth } from '../auth/AuthContext'
import { canModerate } from '../lib/roles'

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
  if (font.moderationState && font.moderationState !== 'visible') {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>{t(font.moderationState === 'pending' ? 'hidden.pendingTitle' : 'hidden.moderationTitle')}</AlertTitle>
        {t(font.moderationState === 'pending' ? 'hidden.pendingBody' : 'hidden.moderationBody')}
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
  const { user } = useAuth()
  const [puedo, setPuedo] = useState<string[]>([])
  const [historial, setHistorial] = useState<FontEdit[] | null>(null)
  const [verHistorial, setVerHistorial] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [abuseOpen, setAbuseOpen] = useState(false)

  useEffect(() => { capabilities().then((c) => setPuedo(c as string[])) }, [])

  // Los dos `useEffect` van ARRIBA del todo, antes del `return null` de más abajo. Con
  // uno por debajo, React cuenta un hook en el primer render y dos en el siguiente y
  // tumba la pantalla entera («Rendered more hooks than during the previous render»).
  const puedeHistorial = puedo.includes('viewFontHistory')
  const puedeDuplicar = puedo.includes('markDuplicate')
  const puedeRetirar = puedo.includes('retireFont')
  const puedeModerar = canModerate(user)
  if (!puedeHistorial && !puedeDuplicar && !puedeRetirar && !puedeModerar) return null

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
        {puedeModerar && (font.moderationState && font.moderationState !== 'visible'
          ? <Button size="small" disabled={ocupado} onClick={() => corre(() => restoreFontAbuse(font.id))}>
              {t('maint.restoreAbuse')}
            </Button>
          : <Button size="small" color="error" startIcon={<ReportProblemIcon />} disabled={ocupado}
                    onClick={() => setAbuseOpen(true)}>
              {t('maint.hideAbuse')}
            </Button>)}
      </Stack>

      <Dialog open={abuseOpen} onClose={() => setAbuseOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('maint.abuseTitle')}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">{t('maint.abuseHelp')}</Typography>
          <Stack spacing={1} sx={{ mt: 2 }}>
            {(['spam', 'fake', 'abuse'] as const).map((reason) => (
              <Button key={reason} color="error" variant="outlined" disabled={ocupado} onClick={() => {
                setAbuseOpen(false)
                void corre(() => hideFontAbuse(font.id, reason))
              }}>
                {t(`maint.abuse.${reason}`)}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setAbuseOpen(false)}>{t('form.cancel')}</Button></DialogActions>
      </Dialog>

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

      <ElegirFuenteCercana
        font={font} open={dupOpen} ocupado={ocupado}
        titulo={t('maint.markDuplicate')} ayuda={t('maint.duplicateHelp')}
        onClose={() => setDupOpen(false)}
        onElegir={(id) => { setDupOpen(false); corre(() => markDuplicate(font.id, id)) }}
      />
    </Box>
  )
}
