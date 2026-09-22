import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import BrokenImageIcon from '@mui/icons-material/BrokenImageOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useI18n } from '../i18n/I18nContext'

// Imagen con carga diferida (lazy) que, al tocarla, se amplía en un visor a
// pantalla completa (lightbox). Cerrar tocando fuera o con Escape.
//
// El visor se pinta **en `document.body` con un portal, no donde está la imagen**, y eso
// no es un detalle: `position: fixed` con `z-index: 2500` NO basta para estar por encima
// de todo. Basta con que un ancestro cree un contexto de apilamiento —`position: sticky`,
// un `transform`, una opacidad— para que ese 2500 se resuelva DENTRO de él y el visor no
// pueda subir por encima de los hermanos del ancestro.
//
// Pasó de verdad: al dejar pegada la columna izquierda de la ficha, `sticky` creó un
// contexto y las reseñas de la columna de al lado se pintaban sobre la foto ampliada. El
// arreglo no es subir el número —dentro de ese contexto no hay número que valga— sino
// sacar el visor del árbol. Así queda inmune a cualquier contenedor futuro.
//
// Cuando se le pasa una `gallery` (todas las fotos de la fuente), el visor a pantalla
// completa es un CARRUSEL: se pasa de foto con el dedo, con las flechas o con el teclado,
// sin salir del visor. Sin `gallery` enseña solo esta foto, como antes.

type Slide = { src: string; alt: string }

const TRANS = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
const pista = (i: number, dx = 0) => `translateX(calc(${-i * 100}% + ${dx}px))`

// Visor a pantalla completa con deslizamiento. Misma técnica que el carrusel de la ficha:
// la pista lleva todas las fotos en fila y se arrastra de forma IMPERATIVA (`trackRef`),
// no por estado, para no repintar N fotos en cada `touchmove`. React solo se entera del
// cambio de foto al soltar (`setI`).
function Lightbox({ photos, start, onClose }: { photos: Slide[]; start: number; onClose: () => void }) {
  const { t } = useI18n()
  const [i, setI] = useState(start)
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; w: number; axis: 'h' | 'v' | null } | null>(null)
  // Arrastrar arriba o abajo más de esto cierra el visor, como en otras apps de fotos.
  const CIERRE_V = 90
  // Tras un arrastre horizontal, el `click` que viene detrás no debe cerrar el visor.
  const suppressClickUntil = useRef(0)
  const many = photos.length > 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1))
      else if (e.key === 'ArrowRight') setI(v => Math.min(photos.length - 1, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  const move = (delta: number) => setI(v => Math.min(photos.length - 1, Math.max(0, v + delta)))

  return createPortal(
    <div
      className="lightbox"
      ref={rootRef}
      onClick={onClose}
      onClickCapture={event => {
        if (Date.now() < suppressClickUntil.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div
        className="lightbox-viewport"
        ref={viewportRef}
        onTouchStart={event => {
          if (event.touches.length !== 1) { drag.current = null; return }
          const point = event.touches[0]
          drag.current = { x: point.clientX, y: point.clientY, w: viewportRef.current?.clientWidth ?? 1, axis: null }
          if (trackRef.current) trackRef.current.style.transition = 'none'
          if (viewportRef.current) viewportRef.current.style.transition = 'none'
        }}
        onTouchMove={event => {
          const d = drag.current
          if (!d) return
          const point = event.touches[0]
          const dx = point.clientX - d.x
          const dy = point.clientY - d.y
          if (!d.axis && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
          if (!d.axis) d.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
          if (d.axis === 'v') {
            // Modo cierre: la foto sigue al dedo en los DOS ejes (así el gesto vale en
            // diagonal, no solo recto) y el fondo se aclara con la distancia, para que se
            // vea que soltando se cierra.
            if (viewportRef.current) viewportRef.current.style.transform = `translate(${dx}px, ${dy}px)`
            if (rootRef.current) rootRef.current.style.opacity = String(Math.max(0.3, 1 - Math.hypot(dx, dy) / 500))
            return
          }
          // Horizontal solo tiene sentido con más de una foto.
          if (!many || !trackRef.current) return
          // Resistencia en los extremos: pasarse de la primera/última cede poco, para que
          // se note el tope en vez de dejar un hueco negro que luego rebota.
          let despl = dx
          if ((i === 0 && dx > 0) || (i === photos.length - 1 && dx < 0)) despl = dx * 0.35
          trackRef.current.style.transform = pista(i, despl)
        }}
        onTouchEnd={event => {
          const d = drag.current
          drag.current = null
          if (trackRef.current) trackRef.current.style.transition = TRANS
          if (viewportRef.current) viewportRef.current.style.transition = TRANS
          if (!d) return
          if (d.axis === 'v') {
            const dy = event.changedTouches[0].clientY - d.y
            const dx = event.changedTouches[0].clientX - d.x
            if (Math.hypot(dx, dy) > 10) suppressClickUntil.current = Date.now() + 500
            if (Math.hypot(dx, dy) > CIERRE_V) { onClose(); return }
            // No llega: vuelve a su sitio.
            if (viewportRef.current) viewportRef.current.style.transform = ''
            if (rootRef.current) rootRef.current.style.opacity = ''
            return
          }
          if (d.axis !== 'h') return
          const dx = event.changedTouches[0].clientX - d.x
          if (Math.abs(dx) > 10) suppressClickUntil.current = Date.now() + 500
          const umbral = Math.min(80, d.w * 0.2)
          const salto = Math.abs(dx) > umbral ? (dx < 0 ? 1 : -1) : 0
          const destino = photos[i + salto] ? i + salto : i
          if (trackRef.current) trackRef.current.style.transform = pista(destino)
          if (destino !== i) setI(destino)
        }}
      >
        <div className="lightbox-track" ref={trackRef} style={{ transform: pista(i) }}>
          {photos.map((photo, n) => (
            <div className="lightbox-slide" key={n}>
              <img src={photo.src} alt={photo.alt} draggable={false} />
            </div>
          ))}
        </div>
      </div>
      {many && <>
        <IconButton
          aria-label={t('carousel.previous')} disabled={i === 0}
          onClick={event => { event.stopPropagation(); move(-1) }}
          sx={{ position: 'fixed', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'common.white', bgcolor: 'rgba(0,0,0,0.4)', width: 48, height: 48, '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' }, '&.Mui-disabled': { visibility: 'hidden' } }}>
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          aria-label={t('carousel.next')} disabled={i === photos.length - 1}
          onClick={event => { event.stopPropagation(); move(1) }}
          sx={{ position: 'fixed', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'common.white', bgcolor: 'rgba(0,0,0,0.4)', width: 48, height: 48, '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' }, '&.Mui-disabled': { visibility: 'hidden' } }}>
          <ChevronRightIcon />
        </IconButton>
        <Typography
          variant="caption"
          sx={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'common.white', bgcolor: 'rgba(0,0,0,0.4)', px: 1, py: 0.25, borderRadius: 1, pointerEvents: 'none' }}>
          {i + 1} / {photos.length}
        </Typography>
      </>}
    </div>,
    document.body,
  )
}

export function ZoomableImage({ src, alt, className, gallery, galleryIndex }: {
  src: string
  alt: string
  className?: string
  // Todas las fotos del grupo (portada + reseñas, o la galería): con esto el visor a
  // pantalla completa se desliza entre ellas. Sin esto, enseña solo `src`.
  gallery?: Slide[]
  galleryIndex?: number
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  /**
   * La foto no ha cargado.
   *
   * Sin esto sale **el icono de imagen rota del navegador**, que parece que la app esté
   * estropeada. Y pasa constantemente sin cobertura: una foto solo queda guardada si
   * alguien la vio antes, así que en una zona guardada casi ninguna lo está.
   *
   * Se reportó probándolo en el monte: la ficha ya cargaba, pero unas fuentes tenían foto
   * y otras el icono roto.
   */
  const [roto, setRoto] = useState(false)

  // Al volver la red se vuelve a intentar. El navegador no reintenta una imagen que ya
  // falló, así que hay que sacarla y reponerla — de ahí la `key` con el contador.
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (!roto) return
    const vuelve = () => { setRoto(false); setIntento((n) => n + 1) }
    window.addEventListener('online', vuelve)
    return () => window.removeEventListener('online', vuelve)
  }, [roto])

  if (roto) {
    // A propósito **no** se parece al hueco de «esta fuente no tiene foto»: ese invita a
    // poner una, y aquí la fuente sí tiene — solo que no está en este móvil. Confundirlos
    // llevaría a alguien a subir una foto repetida creyendo que falta.
    return (
      <Box
        className={className}
        sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 0.5, minHeight: 120, p: 2, borderRadius: 2,
          bgcolor: 'action.hover', color: 'text.secondary', textAlign: 'center',
        }}
      >
        <BrokenImageIcon fontSize="small" />
        <Typography variant="caption">
          {typeof navigator !== 'undefined' && navigator.onLine === false
            ? t('photo.notSaved')
            : t('photo.failed')}
        </Typography>
      </Box>
    )
  }

  // El visor recibe siempre una lista: la galería si viene, o solo esta foto.
  const photos = gallery && gallery.length ? gallery : [{ src, alt }]
  const start = gallery && gallery.length
    ? (galleryIndex ?? Math.max(0, gallery.findIndex(p => p.src === src)))
    : 0

  return (
    <>
      <img
        key={intento}
        className={className}
        src={src}
        alt={alt}
        loading="lazy"
        role="button"
        aria-label={`${t('image.enlarge')}${alt ? `: ${alt}` : ''}`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        style={{ cursor: 'zoom-in' }}
        onClick={() => setOpen(true)}
        onError={() => setRoto(true)}
      />
      {open && <Lightbox photos={photos} start={start} onClose={() => setOpen(false)} />}
    </>
  )
}
