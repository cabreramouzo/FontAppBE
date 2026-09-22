import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import type { CommentResponse, Font } from '../api/types'
import { assetUrl, describeError, setFontPhotoFromComment } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import { fountainPhotos, latestReviewPhoto } from '../lib/fountainPhotos'
import { nombreFuente } from '../lib/fontName'
import { waterStatusInfo } from '../lib/waterStatus'
import { PhotoExifNote } from './PhotoExifNote'
import { ZoomableImage } from './ZoomableImage'
import { useToast } from './ToastContext'

// Deslizamiento estilo Material: la pista lleva todas las fotos en fila y se mueve con
// `translateX`. Antes se pintaba una sola foto y al pasar de foto se reemplazaba de golpe,
// sin transición. Ahora el dedo arrastra la pista y al soltar hace «snap» a la vecina.
const TRANS = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
const pista = (i: number, dx = 0) => `translateX(calc(${-i * 100}% + ${dx}px))`

export function FountainPhotoCarousel({ font, reviews, canPromote, onChanged, children }: {
  font: Font
  reviews: CommentResponse[]
  canPromote: boolean
  onChanged: () => Promise<void>
  children?: ReactNode
}) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const photos = fountainPhotos(font.image, reviews)
  const [selected, setSelected] = useState('cover')
  const [saving, setSaving] = useState(false)
  // El arrastre se aplica de forma IMPERATIVA sobre la pista (`trackRef`), no por estado:
  // un `setState` por cada `touchmove` repintaría las N fotos 60 veces por segundo. React
  // solo se entera del cambio de foto al soltar (`setSelected`).
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; w: number; axis: 'h' | 'v' | null } | null>(null)
  const suppressClickUntil = useRef(0)
  const index = Math.max(0, photos.findIndex(photo => photo.key === selected))
  const current = photos[index]
  const latestPhoto = latestReviewPhoto(reviews)

  // Precarga las vecinas para que la que entra al deslizar ya esté en caché y no aparezca
  // en blanco a mitad de la transición.
  useEffect(() => {
    for (const vecina of [photos[index - 1]?.image, photos[index + 1]?.image]) {
      if (vecina) { const img = new Image(); img.src = assetUrl(vecina) }
    }
  }, [index, photos])

  if (!current) return null
  const review = current.review
  const status = waterStatusInfo(review?.waterStatus ?? null)
  const label = t(review ? 'carousel.review' : 'carousel.cover')
  const move = (delta: number) => {
    const next = photos[index + delta]
    if (next) setSelected(next.key)
  }
  const promote = async () => {
    if (!review || saving) return
    setSaving(true)
    try {
      await setFontPhotoFromComment(font.id, review.id)
      await onChanged()
      setSelected('cover')
      toast.show(t('detail.photoSetAsMain'))
    } catch (error) {
      toast.show(describeError(error, t), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box role="region" aria-label={t('carousel.label')} sx={{ my: 1, minWidth: 0 }}>
      <Box
        ref={viewportRef}
        tabIndex={photos.length > 1 ? 0 : undefined}
        aria-label={t('carousel.label')}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            move(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
        onTouchStart={event => {
          // Lightbox events bubble through the portal; do not swipe the underlying carousel.
          if (!event.currentTarget.contains(event.target as Node)) return
          if (photos.length < 2 || event.touches.length !== 1) { drag.current = null; return }
          const point = event.touches[0]
          drag.current = { x: point.clientX, y: point.clientY, w: viewportRef.current?.clientWidth ?? 1, axis: null }
          if (trackRef.current) trackRef.current.style.transition = 'none'
        }}
        onTouchMove={event => {
          const d = drag.current
          if (!d) return
          const point = event.touches[0]
          const dx = point.clientX - d.x
          const dy = point.clientY - d.y
          if (!d.axis && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
          // Se decide el eje una vez: horizontal → arrastramos la pista; vertical → es scroll
          // de la página y no tocamos nada (`touchAction: pan-y` ya lo permite).
          if (!d.axis) d.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
          if (d.axis !== 'h' || !trackRef.current) return
          // Resistencia en los extremos: arrastrar más allá de la primera/última cede poco,
          // para que se note el tope en vez de dejar un hueco vacío que luego rebota.
          let despl = dx
          if ((index === 0 && dx > 0) || (index === photos.length - 1 && dx < 0)) despl = dx * 0.35
          trackRef.current.style.transform = pista(index, despl)
        }}
        onTouchCancel={() => {
          drag.current = null
          if (trackRef.current) { trackRef.current.style.transition = TRANS; trackRef.current.style.transform = pista(index) }
        }}
        onTouchEnd={event => {
          const d = drag.current
          drag.current = null
          if (!d || d.axis !== 'h') return
          const dx = event.changedTouches[0].clientX - d.x
          if (Math.abs(dx) > 10) suppressClickUntil.current = Date.now() + 500
          // Umbral: 20% del ancho, con un tope de 80 px para móviles anchos.
          const umbral = Math.min(80, d.w * 0.2)
          const salto = Math.abs(dx) > umbral ? (dx < 0 ? 1 : -1) : 0
          const destino = photos[index + salto] ? index + salto : index
          if (trackRef.current) { trackRef.current.style.transition = TRANS; trackRef.current.style.transform = pista(destino) }
          if (destino !== index) setSelected(photos[destino].key)
        }}
        onClickCapture={event => {
          if (Date.now() < suppressClickUntil.current) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        sx={{
          position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover',
          aspectRatio: '4 / 3', touchAction: 'pan-y pinch-zoom',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          '& .carousel-image': { display: 'block', width: '100%', height: '100%', objectFit: 'contain', m: 0 },
        }}
      >
        <Box
          ref={trackRef}
          style={{ transform: pista(index) }}
          sx={{ display: 'flex', height: '100%', transition: TRANS, willChange: 'transform' }}
        >
          {photos.map(photo => (
            <Box key={photo.key} sx={{ flex: '0 0 100%', height: '100%', minWidth: 0 }}>
              <ZoomableImage
                className="carousel-image"
                src={assetUrl(photo.image)}
                alt={`${nombreFuente(font, t)} — ${t(photo.review ? 'carousel.review' : 'carousel.cover')}`}
              />
            </Box>
          ))}
        </Box>
        {photos.length > 1 && <>
          <IconButton aria-label={t('carousel.previous')} disabled={index === 0} onClick={() => move(-1)}
            sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'background.paper', width: 44, height: 44, '&:hover': { bgcolor: 'background.paper' }, '&.Mui-disabled': { visibility: 'hidden' } }}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton aria-label={t('carousel.next')} disabled={index === photos.length - 1} onClick={() => move(1)}
            sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'background.paper', width: 44, height: 44, '&:hover': { bgcolor: 'background.paper' }, '&.Mui-disabled': { visibility: 'hidden' } }}>
            <ChevronRightIcon />
          </IconButton>
        </>}
      </Box>
      <Box aria-live="polite" aria-atomic="true" sx={{ pt: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Chip size="small" label={label} variant="outlined" />
          {review && <Typography component="time" dateTime={review.createdAt} variant="caption" color="text.secondary">
            {new Date(review.createdAt).toLocaleDateString(lang)}
          </Typography>}
          {photos.length > 1 && <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{index + 1} / {photos.length}</Typography>}
        </Stack>
        {review && <Stack direction="row" sx={{ mt: 0.5, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {review.username && <Link component={RouterLink} to={`/users/${encodeURIComponent(review.username)}`} variant="body2">@{review.username}</Link>}
          {status && <Typography variant="caption" color="text.secondary">{t('carousel.reportedStatus')}: {status.emoji} {t(`status.${status.key}`)}</Typography>}
        </Stack>}
      </Box>
      {latestPhoto && latestPhoto !== current.key && <Button size="small" onClick={() => setSelected(latestPhoto)} sx={{ mt: 0.5 }}>{t('carousel.latest')}</Button>}
      <PhotoExifNote image={current.image} lat={font.latitude} long={font.longitude} />
      {review && canPromote && current.image !== font.image && <Button size="small" disabled={saving} onClick={promote}>{t('detail.useAsMainPhoto')}</Button>}
      {!review && children}
    </Box>
  )
}
