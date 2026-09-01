import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import CollectionsIcon from '@mui/icons-material/CollectionsOutlined'
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { Link as RouterLink } from 'react-router-dom'
import { addFontPhoto, ApiError, assetUrl, deleteFontPhoto, describeError, getFontPhotos, getGamification, uploadImage } from '../api/client'
import type { FontPhoto, PhotoKind } from '../api/client'
import type { GamificationProfile } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { Skeleton } from './Skeleton'
import { ZoomableImage } from './ZoomableImage'
import { prepararFoto } from '../lib/image'
import { capabilityLevels } from '../lib/capabilities'
import { bloqueoDe } from '../lib/capabilityNotice'

/**
 * «Otras fotos»: la galería de una fuente, detrás de un botón y en otra pantalla.
 *
 * ## Por qué no se carga con la ficha
 *
 * Porque casi nadie la va a abrir. La portada ya viene en `fonts.image` —una columna, sin
 * joins— y la ficha se pinta entera sin saber que esto existe. La galería es una petición
 * más, y solo la paga quien la pide. Ni siquiera se enseña un contador: saber «cuántas
 * hay» costaría un `COUNT` por fuente en el listado y el mapa, que es exactamente el
 * gasto que este diseño evita.
 *
 * ## Los tipos no son decoración
 *
 * Una imagen aquí puede ser otro ángulo de la fuente, **un documento** (un informe de
 * salubridad, un cartel del ayuntamiento) o el acceso. Se separan visualmente porque
 * responden a preguntas distintas, y sobre todo porque un documento **no compite por la
 * portada**: mezclarlos dejaría un PDF fotografiado al lado del primer plano del caño,
 * con el mismo peso.
 *
 * Los documentos llevan aviso: los aporta quien los tiene, no los certifica la app.
 */
export function FontGallery({ fontID }: { fontID: string }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [fotos, setFotos] = useState<FontPhoto[] | null>(null)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [kind, setKind] = useState<PhotoKind>('fountain')
  const [caption, setCaption] = useState('')
  // A partir de qué nivel se pueden subir fotos de la fuente. Viene del servidor: el
  // aviso decía «nivel 3» escrito a mano y ese número no puede vivir en dos sitios.
  const [nivelFotos, setNivelFotos] = useState<{ level: string; gotes: number } | null>(null)
  // Lo que ESTA persona puede ya. `undefined` es «aún no lo sabemos» y se calla.
  const [grant, setGrant] = useState<GamificationProfile['grant'] | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    capabilityLevels().then((cs) => {
      const c = cs.find((x) => x.key === 'addSecondaryPhoto')
      if (c) setNivelFotos({ level: c.level, gotes: c.gotes })
    })
  }, [open])

  useEffect(() => {
    if (!open || !user) return
    // 204 (gamificación apagada) llega como null, que es un motivo de bloqueo de verdad.
    getGamification().then((p) => setGrant(p ? (p.grant ?? null) : null)).catch(() => setGrant(undefined))
  }, [open, user])

  /**
   * Qué le falta a quien mira, o nada si ya puede.
   *
   * Antes decía siempre «necesitas el nivel Rierol», tuvieras el nivel o no. Lo reportó
   * alguien con 3.949 gotas —de sobra— al que le faltaban días distintos con aportación.
   */
  const bloqueo = bloqueoDe('addSecondaryPhoto', grant)
  const avisoNivel = !bloqueo
    ? ''
    : bloqueo.clave !== 'cap.needLevel'
      ? t(bloqueo.clave, bloqueo.params)
      : nivelFotos
        ? t('cap.needLevel', {
            level: t(`game.level.${nivelFotos.level}`),
            n: nivelFotos.gotes.toLocaleString(lang),
          })
        : t('cap.needLevelUnknown')

  useEffect(() => {
    if (!open || fotos) return
    getFontPhotos(fontID).then(setFotos).catch(() => setFotos([]))
  }, [open, fotos, fontID])

  async function subir(file: File) {
    setError('')
    setSubiendo(true)
    try {
      const { photo, meta } = await prepararFoto(file)
      const url = await uploadImage(photo, meta)
      const nueva = await addFontPhoto(fontID, { url, kind, caption: caption.trim() || undefined })
      setFotos((f) => [nueva, ...(f ?? [])])
      setCaption('')
    } catch (e) {
      // Un 403 aquí solo puede ser la capacidad, y el servidor no sabe en qué idioma
      // contestarte: se sustituye por el aviso que sí nombra lo que falta.
      setError(e instanceof ApiError && e.status === 403
        ? (avisoNivel || t('cap.needLevelUnknown'))
        : describeError(e, t))
    } finally {
      setSubiendo(false)
    }
  }

  async function borrar(p: FontPhoto) {
    if (!confirm(t('image.confirmRemove'))) return
    try {
      await deleteFontPhoto(fontID, p.id)
      setFotos((f) => (f ?? []).filter((x) => x.id !== p.id))
    } catch (e) {
      setError(describeError(e, t))
    }
  }

  const documentos = (fotos ?? []).filter((p) => p.kind === 'document')
  const imagenes = (fotos ?? []).filter((p) => p.kind !== 'document')

  return (
    <>
      <Button variant="outlined" startIcon={<CollectionsIcon />} onClick={() => setOpen(true)}>
        {t('gallery.open')}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle>{t('gallery.title')}</DialogTitle>
        <DialogContent dividers>
          {fotos === null && <Skeleton lines={4} />}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {fotos !== null && fotos.length === 0 && (
            <Typography color="text.secondary">{t('gallery.empty')}</Typography>
          )}

          {imagenes.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
              {imagenes.map((p) => (
                <Foto key={p.id} p={p} puedeBorrar={!!user && (user.id === p.uploader.id || !!user.isAdmin)} onBorrar={() => borrar(p)} />
              ))}
            </Box>
          )}

          {documentos.length > 0 && (
            <Box sx={{ mt: imagenes.length > 0 ? 3 : 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <DescriptionIcon fontSize="small" /> {t('gallery.documents')}
              </Typography>
              {/* Un análisis del agua lo aporta quien lo tiene; la app no lo certifica.
                  Se dice aquí y no en letra pequeña al final porque quien mira un informe
                  de salubridad está decidiendo si bebe. */}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {t('gallery.documentsNote')}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                {documentos.map((p) => (
                  <Foto key={p.id} p={p} puedeBorrar={!!user && (user.id === p.uploader.id || !!user.isAdmin)} onBorrar={() => borrar(p)} />
                ))}
              </Box>
            </Box>
          )}

          {user && (
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>{t('gallery.add')}</Typography>
              <TextField
                select size="small" value={kind} onChange={(e) => setKind(e.target.value as PhotoKind)}
                label={t('gallery.kind')} sx={{ minWidth: 200, mb: 1 }}
              >
                <MenuItem value="fountain">{t('gallery.kind.fountain')}</MenuItem>
                <MenuItem value="document">{t('gallery.kind.document')}</MenuItem>
                <MenuItem value="context">{t('gallery.kind.context')}</MenuItem>
              </TextField>
              <TextField
                size="small" fullWidth value={caption} onChange={(e) => setCaption(e.target.value)}
                label={t('gallery.caption')} placeholder={t('gallery.captionHint')}
                slotProps={{ htmlInput: { maxLength: 200 } }} sx={{ mb: 1 }}
              />
              <Button component="label" variant="outlined" size="small" disabled={subiendo}>
                {subiendo ? t('gallery.uploading') : t('gallery.choose')}
                <input
                  hidden type="file" accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }}
                />
              </Button>
              {/* Solo las de la fuente piden nivel; el documento no. Se dice antes de
                  intentarlo, no después de un 403. */}
              {/* Solo se dice lo que falta si de verdad falta algo: a quien ya puede,
                  el aviso le estaba diciendo que no podía. */}
              {kind !== 'document' && avisoNivel && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {avisoNivel} {t('gallery.documentsFree')}{' '}
                  <Link component={RouterLink} to="/gamification">{t('gameHelp.readMore')}</Link>
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('gameHelp.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function Foto({ p, puedeBorrar, onBorrar }: { p: FontPhoto; puedeBorrar: boolean; onBorrar: () => void }) {
  const { t } = useI18n()
  return (
    <Box sx={{ position: 'relative' }}>
      <ZoomableImage src={assetUrl(p.url)} alt={p.caption ?? ''} className="gallery-thumb" />
      {p.kind === 'context' && (
        <Chip size="small" label={t('gallery.kind.context')} sx={{ position: 'absolute', top: 6, left: 6, height: 20 }} />
      )}
      {p.caption && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>{p.caption}</Typography>
      )}
      {p.uploader.username && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          <Link component={RouterLink} to={`/users/${encodeURIComponent(p.uploader.username)}`}>@{p.uploader.username}</Link>
        </Typography>
      )}
      {puedeBorrar && (
        <IconButton
          size="small" color="error" onClick={onBorrar} aria-label={t('detail.delete')}
          sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.45)', color: 'common.white' }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  )
}
