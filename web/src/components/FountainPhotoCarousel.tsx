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
  const touch = useRef<{ x: number; y: number } | null>(null)
  const suppressClickUntil = useRef(0)
  const index = Math.max(0, photos.findIndex(photo => photo.key === selected))
  const current = photos[index]
  const nextImage = photos[index + 1]?.image
  const latestPhoto = latestReviewPhoto(reviews)

  useEffect(() => {
    if (!nextImage) return
    const image = new Image()
    image.src = assetUrl(nextImage)
  }, [nextImage])

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
          const point = event.touches[0]
          touch.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null
        }}
        onTouchCancel={() => { touch.current = null }}
        onTouchEnd={event => {
          if (!touch.current) return
          const point = event.changedTouches[0]
          const dx = point.clientX - touch.current.x
          const dy = point.clientY - touch.current.y
          touch.current = null
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            suppressClickUntil.current = Date.now() + 500
            move(dx < 0 ? 1 : -1)
          }
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
        <ZoomableImage key={current.image} className="carousel-image" src={assetUrl(current.image)} alt={`${nombreFuente(font, t)} — ${label}`} />
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
