import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import BrokenImageIcon from '@mui/icons-material/BrokenImageOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useI18n } from '../i18n/I18nContext'
import {
  clampPan, distance, isZoomed, MAX_SCALE, MIN_SCALE, NO_ZOOM, settle, toggleZoom, zoomAbout,
  type Point, type Zoom,
} from '../lib/pinchZoom'

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
const ZOOM_TRANS = 'transform 220ms ease-out'
const DOUBLE_TAP_MS = 280
/** Wait before a tap closes the viewer, so a second tap can make it a double tap. Must be
 * LONGER than the double-tap window: otherwise a second tap arriving between the two
 * finds the viewer already closed. */
const CLOSE_DELAY_MS = DOUBLE_TAP_MS + 40
const midpointOf = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) =>
  ({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 })

// Visor a pantalla completa con deslizamiento. Misma técnica que el carrusel de la ficha:
// la pista lleva todas las fotos en fila y se arrastra de forma IMPERATIVA (`trackRef`),
// no por estado, para no repintar N fotos en cada `touchmove`. React solo se entera del
// cambio de foto al soltar (`setI`).
//
// Zoom: pellizcar, doble toque (o doble clic) y rueda / pellizco del trackpad. Va a mano
// porque el visor lleva `touch-action: none` —para quedarse los gestos de pasar de foto y
// de cerrar—, y eso apaga también el pellizco del navegador. La geometría vive en
// `lib/pinchZoom.ts`, con tests. Con la foto ampliada, un dedo la ARRASTRA en vez de pasar
// de foto o cerrar, y tocarla no cierra el visor: con zoom, cualquier roce lo cerraría.
function Lightbox({ photos, start, onClose }: { photos: Slide[]; start: number; onClose: () => void }) {
  const { t } = useI18n()
  const [i, setI] = useState(start)
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])
  const drag = useRef<{ x: number; y: number; w: number; axis: 'h' | 'v' | null } | null>(null)
  // Arrastrar arriba o abajo más de esto cierra el visor, como en otras apps de fotos.
  const CIERRE_V = 90
  // Tras un arrastre horizontal, el `click` que viene detrás no debe cerrar el visor.
  const suppressClickUntil = useRef(0)
  const many = photos.length > 1

  const zoom = useRef<Zoom>(NO_ZOOM)
  const pinch = useRef<{ d0: number; m0: Point; z0: Zoom } | null>(null)
  const pan = useRef<{ x: number; y: number; z0: Zoom; moved: boolean } | null>(null)
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  // Un toque cierra el visor, pero con RETRASO: si llega un segundo toque es un doble
  // toque (zoom) y el cierre se cancela. Sin esto, el primer toque cerraba antes de que
  // hubiera ocasión de ampliar.
  const closeTimer = useRef<number | null>(null)
  const lastTouchToggle = useRef(0)

  /** Centre and size of the viewer; zoom coordinates are relative to this centre. */
  const frame = () => {
    const r = viewportRef.current?.getBoundingClientRect()
    return r
      ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
      : { cx: window.innerWidth / 2, cy: window.innerHeight / 2, w: window.innerWidth, h: window.innerHeight }
  }
  const rel = (p: { clientX: number; clientY: number }): Point => {
    const f = frame()
    return { x: p.clientX - f.cx, y: p.clientY - f.cy }
  }
  /** Untransformed size of the current photo, as laid out (`object-fit` box). */
  const imgSize = () => {
    const img = imgRefs.current[i]
    return { w: img?.offsetWidth ?? 0, h: img?.offsetHeight ?? 0 }
  }
  const applyZoom = (z: Zoom, animate: boolean) => {
    zoom.current = z
    const img = imgRefs.current[i]
    if (!img) return
    img.style.transition = animate ? ZOOM_TRANS : 'none'
    img.style.transform = isZoomed(z) ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : ''
    if (viewportRef.current) viewportRef.current.style.cursor = isZoomed(z) ? 'grab' : ''
  }
  const settleZoom = () => {
    const f = frame(), sz = imgSize()
    applyZoom(settle(zoom.current, sz.w, sz.h, f.w, f.h), true)
  }
  const toggleAt = (p: { clientX: number; clientY: number }) => {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
    const f = frame(), sz = imgSize()
    applyZoom(toggleZoom(zoom.current, rel(p), sz.w, sz.h, f.w, f.h), true)
  }

  // Cambiar de foto (flechas, teclado, deslizar) devuelve la anterior a su tamaño: al
  // volver a ella no tiene que seguir ampliada y desplazada donde se dejó.
  useEffect(() => {
    zoom.current = NO_ZOOM
    for (const img of imgRefs.current) if (img) { img.style.transition = 'none'; img.style.transform = '' }
    if (viewportRef.current) viewportRef.current.style.cursor = ''
  }, [i])

  useEffect(() => () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1))
      else if (e.key === 'ArrowRight') setI(v => Math.min(photos.length - 1, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  // Rueda del ratón y pellizco del trackpad (que llega como rueda con `ctrlKey`). Va con
  // un listener nativo `passive: false`: el `onWheel` de React es pasivo, no puede frenar
  // el desplazamiento de la página de debajo, y en Safari el pellizco del trackpad
  // ampliaría la página entera en vez de la foto.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom.current.s * factor))
      const p = rel(e)
      const f = frame(), sz = imgSize()
      applyZoom(s <= MIN_SCALE ? NO_ZOOM : clampPan(zoomAbout(zoom.current, s, p, p), sz.w, sz.h, f.w, f.h), false)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const move = (delta: number) => setI(v => Math.min(photos.length - 1, Math.max(0, v + delta)))

  return createPortal(
    <div
      className="lightbox"
      ref={rootRef}
      onClick={() => {
        // Con la foto ampliada, tocar no cierra: se estaría mirando un detalle.
        if (isZoomed(zoom.current) || closeTimer.current !== null) return
        closeTimer.current = window.setTimeout(() => { closeTimer.current = null; onClose() }, CLOSE_DELAY_MS)
      }}
      onDoubleClick={event => {
        // En el móvil el doble toque ya lo ha atendido `touchend`; el `dblclick` que algunos
        // navegadores disparan después lo desharía.
        if (Date.now() - lastTouchToggle.current < 700) return
        toggleAt(event)
      }}
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
        onMouseDown={event => {
          // Arrastrar con el ratón una foto ampliada (en escritorio no hay dedos).
          if (event.button !== 0 || !isZoomed(zoom.current)) return
          event.preventDefault()
          const start = { x: event.clientX, y: event.clientY, z0: zoom.current }
          let moved = false
          const onMove = (e: MouseEvent) => {
            const dx = e.clientX - start.x, dy = e.clientY - start.y
            if (Math.hypot(dx, dy) > 4) moved = true
            const f = frame(), sz = imgSize()
            applyZoom(clampPan({ ...start.z0, x: start.z0.x + dx, y: start.z0.y + dy }, sz.w, sz.h, f.w, f.h), false)
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            if (moved) suppressClickUntil.current = Date.now() + 400
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
        onTouchStart={event => {
          if (event.touches.length === 2) {
            // Empieza un pellizco: se cancela el deslizamiento que hubiera empezado el
            // primer dedo y la pista vuelve a su sitio.
            drag.current = null
            pan.current = null
            if (trackRef.current) { trackRef.current.style.transition = TRANS; trackRef.current.style.transform = pista(i) }
            if (viewportRef.current) viewportRef.current.style.transform = ''
            if (rootRef.current) rootRef.current.style.opacity = ''
            const a = event.touches[0], b = event.touches[1]
            pinch.current = {
              d0: Math.max(1, distance({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY })),
              m0: rel(midpointOf(a, b)),
              z0: zoom.current,
            }
            suppressClickUntil.current = Date.now() + 500
            return
          }
          if (event.touches.length !== 1) { drag.current = null; return }
          const point = event.touches[0]
          if (isZoomed(zoom.current)) {
            // Ampliada: un dedo arrastra la foto, no pasa de foto ni cierra.
            drag.current = null
            pan.current = { x: point.clientX, y: point.clientY, z0: zoom.current, moved: false }
            return
          }
          drag.current = { x: point.clientX, y: point.clientY, w: viewportRef.current?.clientWidth ?? 1, axis: null }
          if (trackRef.current) trackRef.current.style.transition = 'none'
          if (viewportRef.current) viewportRef.current.style.transition = 'none'
        }}
        onTouchMove={event => {
          const pz = pinch.current
          if (pz && event.touches.length >= 2) {
            const a = event.touches[0], b = event.touches[1]
            const d = distance({ x: a.clientX, y: a.clientY }, { x: b.clientX, y: b.clientY })
            // Se deja pasar un poco de los límites mientras se pellizca (se nota elástico
            // en vez de chocar contra una pared); `settle` lo devuelve al soltar.
            const s = Math.min(MAX_SCALE * 1.25, Math.max(0.8, pz.z0.s * (d / pz.d0)))
            applyZoom(zoomAbout(pz.z0, s, pz.m0, rel(midpointOf(a, b))), false)
            return
          }
          const pn = pan.current
          if (pn) {
            const point = event.touches[0]
            const dx = point.clientX - pn.x, dy = point.clientY - pn.y
            if (Math.hypot(dx, dy) > 4) pn.moved = true
            const f = frame(), sz = imgSize()
            applyZoom(clampPan({ ...pn.z0, x: pn.z0.x + dx, y: pn.z0.y + dy }, sz.w, sz.h, f.w, f.h), false)
            return
          }
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
          if (pinch.current) {
            if (event.touches.length === 1 && isZoomed(zoom.current)) {
              // Se levanta un dedo y queda el otro: se sigue arrastrando con ése.
              pinch.current = null
              const p = event.touches[0]
              pan.current = { x: p.clientX, y: p.clientY, z0: zoom.current, moved: true }
              return
            }
            if (event.touches.length === 0) { pinch.current = null; settleZoom() }
            suppressClickUntil.current = Date.now() + 400
            return
          }
          const pn = pan.current
          if (pn) {
            pan.current = null
            settleZoom()
            if (pn.moved) { suppressClickUntil.current = Date.now() + 400; return }
            // Un toque sin mover sobre la foto ampliada: puede ser un doble toque (abajo).
          }

          const d = drag.current
          drag.current = null
          if (trackRef.current) trackRef.current.style.transition = TRANS
          if (viewportRef.current) viewportRef.current.style.transition = TRANS

          // ¿Toque sin arrastre? Mira si es el segundo de un doble toque.
          if (!d || d.axis === null) {
            const pt = event.changedTouches[0]
            const now = Date.now()
            const prev = lastTap.current
            if (pt && prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(pt.clientX - prev.x, pt.clientY - prev.y) < 30) {
              lastTap.current = null
              lastTouchToggle.current = now
              suppressClickUntil.current = now + 400
              toggleAt(pt)
              return
            }
            lastTap.current = pt ? { t: now, x: pt.clientX, y: pt.clientY } : null
            return
          }
          lastTap.current = null
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
              <img ref={el => { imgRefs.current[n] = el }} src={photo.src} alt={photo.alt} draggable={false} />
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
