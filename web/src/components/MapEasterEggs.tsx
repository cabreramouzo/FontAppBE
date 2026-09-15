import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Map as LeafletMap } from 'leaflet'
import { useI18n } from '../i18n/I18nContext'

type Sorpresa = 'wish' | 'underwater' | 'midnight' | 'cartographers' | 'ocean' | 'chemistry'

const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right']
const OCEAN_BOXES = [
  { minLat: 15, maxLat: 68, minLng: -45, maxLng: -11 }, // Atlántico
  { minLat: 30, maxLat: 46, minLng: 2, maxLng: 6 },     // Mediterráneo occidental
]

function enOceano(lat: number, lng: number) {
  return OCEAN_BOXES.some((b) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng)
}

/** Guiños que pertenecen al mapa. Ninguno cambia datos, progreso ni analíticas. */
export function MapEasterEggs({ map, wish }: { map: LeafletMap | null; wish: number }) {
  const { t } = useI18n()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [sorpresa, setSorpresa] = useState<Sorpresa | null>(null)
  const timer = useRef<number | null>(null)

  function muestra(s: Sorpresa) {
    setSorpresa(s)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSorpresa(null), 3600)
  }

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  useEffect(() => { if (wish > 0) muestra('wish') }, [wish])

  useEffect(() => {
    let letras = ''
    let pasos: string[] = []
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const direction: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
      if (direction[event.key]) {
        pasos = [...pasos, direction[event.key]].slice(-KONAMI.length)
        if (pasos.join() === KONAMI.join()) { pasos = []; muestra('underwater') }
      }
      if (/^[a-z0-9]$/i.test(event.key)) {
        letras = (letras + event.key.toUpperCase()).slice(-3)
        if (letras === 'H2O') { letras = ''; muestra('chemistry') }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    if (!map) return
    const container = map.getContainer()
    let inicio: [number, number] | null = null
    let touchID: number | null = null
    let pasos: string[] = []
    let ultimaDireccion = 0
    let ultimoTouch = 0
    const registra = (dx: number, dy: number) => {
      const now = Date.now()
      if (now - ultimaDireccion > 8000) pasos = []
      ultimaDireccion = now
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
      pasos = [...pasos, dir].slice(-KONAMI.length)
      if (pasos.join() === KONAMI.join()) { pasos = []; muestra('underwater') }
    }
    const down = (e: PointerEvent) => {
      // En iOS llegan touch + pointer para el mismo dedo. Allí manda touch, que Leaflet
      // no puede cancelar porque lo escuchamos en window durante la captura.
      if (Date.now() - ultimoTouch < 500) return
      inicio = [e.clientX, e.clientY]
    }
    const up = (e: PointerEvent) => {
      if (!inicio) return
      const dx = e.clientX - inicio[0]
      const dy = e.clientY - inicio[1]
      inicio = null
      registra(dx, dy)
    }
    const touchStart = (e: TouchEvent) => {
      if (!(e.target instanceof Node) || !container.contains(e.target) || e.touches.length !== 1) return
      const touch = e.touches[0]
      ultimoTouch = Date.now()
      touchID = touch.identifier
      inicio = [touch.clientX, touch.clientY]
    }
    const touchEnd = (e: TouchEvent) => {
      if (!inicio || touchID === null) return
      const touch = Array.from(e.changedTouches).find((item) => item.identifier === touchID)
      if (!touch) return
      const dx = touch.clientX - inicio[0]
      const dy = touch.clientY - inicio[1]
      inicio = null
      touchID = null
      ultimoTouch = Date.now()
      registra(dx, dy)
    }
    container.addEventListener('pointerdown', down)
    container.addEventListener('pointerup', up)
    window.addEventListener('touchstart', touchStart, { capture: true, passive: true })
    window.addEventListener('touchend', touchEnd, { capture: true, passive: true })
    return () => {
      container.removeEventListener('pointerdown', down)
      container.removeEventListener('pointerup', up)
      window.removeEventListener('touchstart', touchStart, { capture: true })
      window.removeEventListener('touchend', touchEnd, { capture: true })
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    let taps = 0
    let primero = 0
    let arrastres: number[] = []
    const click = (event: MouseEvent) => {
      const target = event.target as Element | null
      // Los enlaces de atribución siguen funcionando normalmente. El secreto vive en el
      // fondo del control, para que descubrirlo no abra siete pestañas de OpenStreetMap.
      if (target?.closest('.leaflet-control-attribution') && !target.closest('a')) {
        const now = Date.now()
        if (now - primero > 5000) { taps = 0; primero = now }
        taps++
        if (taps >= 7) { taps = 0; muestra('cartographers') }
      }
      if (target?.closest('.leaflet-marker-icon') && new Date().getHours() === 0) muestra('midnight')
    }
    const drag = () => {
      const c = map.getCenter()
      if (!enOceano(c.lat, c.lng)) { arrastres = []; return }
      const now = Date.now()
      arrastres = [...arrastres.filter((n) => now - n < 12000), now]
      if (arrastres.length >= 4) { arrastres = []; muestra('ocean') }
    }
    map.getContainer().addEventListener('click', click)
    map.on('dragend', drag)
    return () => { map.getContainer().removeEventListener('click', click); map.off('dragend', drag) }
  }, [map])

  if (!sorpresa) return null
  const contenido: Record<Sorpresa, { emoji: string; title: string; body: string }> = {
    wish: { emoji: '🪙⛲', title: t('egg.wishTitle'), body: t('egg.wishBody') },
    underwater: { emoji: '🐠🫧', title: t('egg.underwaterTitle'), body: '↑ ↑ ↓ ↓ ← → ← →' },
    midnight: { emoji: '✨⛲🌙', title: t('egg.midnightTitle'), body: t('egg.midnightBody') },
    cartographers: { emoji: '🗺️💙', title: t('egg.cartographersTitle'), body: t('egg.cartographersBody') },
    ocean: { emoji: '🐋', title: t('egg.oceanTitle'), body: t('egg.oceanBody') },
    chemistry: { emoji: 'H₂O', title: t('egg.chemistryTitle'), body: t('egg.chemistryBody') },
  }
  const c = contenido[sorpresa]
  return (
    <Box aria-live="polite" sx={{ position: 'fixed', inset: 0, zIndex: 1999, pointerEvents: 'none', overflow: 'hidden' }}>
      {sorpresa === 'underwater' && <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,120,190,.18), rgba(0,42,100,.48))', backdropFilter: 'hue-rotate(12deg) saturate(1.25)' }} />}
      {sorpresa === 'ocean' && <Typography sx={{ position: 'absolute', left: '12%', bottom: '12%', fontSize: { xs: 88, sm: 130 }, animation: reducedMotion ? 'none' : 'eggWhale 3.4s ease-in-out both' }}>🐋</Typography>}
      <Fade in appear timeout={reducedMotion ? 0 : undefined}>
        <Box sx={{ position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%,-50%)', textAlign: 'center', bgcolor: 'rgba(255,255,255,.92)', color: '#123', borderRadius: 4, boxShadow: 8, px: 3, py: 2.25, minWidth: 240, maxWidth: '82vw', '@media (prefers-color-scheme: dark)': { bgcolor: 'rgba(15,22,30,.94)', color: '#fff' } }}>
          <Typography sx={{ fontSize: 48, lineHeight: 1.1 }}>{c.emoji}</Typography>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 800 }}>{c.title}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.8 }}>{c.body}</Typography>
        </Box>
      </Fade>
      <style>{`@keyframes eggWhale { 0% { transform: translate(-30vw,30px) rotate(-8deg); opacity:0 } 25% {opacity:1} 100% { transform: translate(95vw,-90px) rotate(5deg); opacity:0 } }`}</style>
    </Box>
  )
}
