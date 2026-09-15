import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { LatLng, Map as LeafletMap } from 'leaflet'
import { useI18n } from '../i18n/I18nContext'

type Sorpresa = 'wish' | 'underwater' | 'midnight' | 'cartographers' | 'ocean' | 'chemistry'

const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right']
const OCEAN_BOXES = [
  // Solo alta mar. La primera versión incluía un rectángulo mediterráneo (2–6 E,
  // 30–46 N) que también cubría Cataluña y Francia: cuatro movimientos normales podían
  // sacar una ballena en tierra. Es preferible que el secreto sea difícil a que moleste.
  { minLat: 22, maxLat: 61, minLng: -40, maxLng: -15 },
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
    let taps = 0
    let primero = 0
    let arrastres: number[] = []
    let ballenaVista = (() => { try { return sessionStorage.getItem('fontapp_whale_seen') === '1' } catch { return false } })()
    let inicioArrastre: LatLng | null = null
    let konami: string[] = []
    let ultimoPaso = 0
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
    const dragStart = () => { inicioArrastre = map.getCenter() }
    const drag = () => {
      // Leaflet es quien decide que hubo arrastre. Esto es más fiable que touch/pointer
      // en Safari: al terminar, el antiguo centro aparece desplazado en pantalla justo
      // en la dirección que siguió el dedo, incluso si el mapa está girado.
      if (inicioArrastre) {
        const centro = map.getSize().divideBy(2)
        const anterior = map.latLngToContainerPoint(inicioArrastre)
        const dx = anterior.x - centro.x
        const dy = anterior.y - centro.y
        const now = Date.now()
        if (now - ultimoPaso > 20_000) konami = []
        ultimoPaso = now
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 28) {
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
          konami = [...konami, dir].slice(-KONAMI.length)
          if (konami.join() === KONAMI.join()) { konami = []; muestra('underwater') }
        }
        inicioArrastre = null
      }
      const c = map.getCenter()
      // A zoom cercano incluso una caja conservadora puede contener una isla. La ballena
      // pertenece a explorar el océano, no a desplazarse por una calle o una ruta.
      if (ballenaVista || map.getZoom() > 6 || !enOceano(c.lat, c.lng)) { arrastres = []; return }
      const now = Date.now()
      arrastres = [...arrastres.filter((n) => now - n < 12000), now]
      if (arrastres.length >= 4) {
        arrastres = []
        ballenaVista = true
        try { sessionStorage.setItem('fontapp_whale_seen', '1') } catch { /* memoria privada */ }
        muestra('ocean')
      }
    }
    map.getContainer().addEventListener('click', click)
    map.on('dragstart', dragStart)
    map.on('dragend', drag)
    return () => {
      map.getContainer().removeEventListener('click', click)
      map.off('dragstart', dragStart)
      map.off('dragend', drag)
    }
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
  const icono = sorpresa === 'wish' ? (
    <Box className="egg-wish" sx={{ position: 'relative', height: 76, width: 100, mx: 'auto' }}>
      <span className="egg-coin">🪙</span>
      <span className="egg-fountain">⛲</span>
      <span className="egg-ripple" />
    </Box>
  ) : (
    <span className={`egg-icon egg-${sorpresa}`}>{c.emoji}</span>
  )
  return (
    <Box className={reducedMotion ? 'egg-reduced' : ''} aria-live="polite" sx={{ position: 'fixed', inset: 0, zIndex: 1999, pointerEvents: 'none', overflow: 'hidden' }}>
      {sorpresa === 'underwater' && <Box className="egg-water" sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,120,190,.18), rgba(0,42,100,.48))', backdropFilter: 'hue-rotate(12deg) saturate(1.25)' }}>
        {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${6 + (i * 17) % 90}%`, animationDelay: `${(i % 5) * .23}s`, width: 5 + (i % 4) * 3, height: 5 + (i % 4) * 3 }} />)}
      </Box>}
      {sorpresa === 'ocean' && <Typography sx={{ position: 'absolute', left: '12%', bottom: '12%', fontSize: { xs: 88, sm: 130 }, animation: reducedMotion ? 'none' : 'eggWhale 3.4s ease-in-out both' }}>🐋</Typography>}
      <Fade in appear timeout={reducedMotion ? 0 : undefined}>
        <Box sx={{ position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%,-50%)', textAlign: 'center', bgcolor: 'rgba(255,255,255,.92)', color: '#123', borderRadius: 4, boxShadow: 8, px: 3, py: 2.25, minWidth: 240, maxWidth: '82vw', '@media (prefers-color-scheme: dark)': { bgcolor: 'rgba(15,22,30,.94)', color: '#fff' } }}>
          <Typography component="div" sx={{ fontSize: 48, lineHeight: 1.1 }}>{icono}</Typography>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 800 }}>{c.title}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.8 }}>{c.body}</Typography>
        </Box>
      </Fade>
      <style>{`
        .egg-icon { display:inline-block; transform-origin:50% 70% }
        .egg-coin { position:absolute; z-index:2; left:38px; top:-4px; font-size:29px; animation:eggCoin 1.55s cubic-bezier(.34,.02,.72,1) both }
        .egg-fountain { position:absolute; z-index:1; left:22px; bottom:0; font-size:56px; animation:eggFountain 1.8s ease-in-out .9s both }
        .egg-ripple { position:absolute; z-index:3; left:43px; bottom:9px; width:16px; height:5px; border:2px solid #42bcec; border-radius:50%; opacity:0; animation:eggRipple 1.4s ease-out 1.05s both }
        .egg-underwater { animation:eggSwim 2.4s ease-in-out infinite }
        .egg-midnight { animation:eggShine 1.5s ease-in-out infinite alternate }
        .egg-cartographers { animation:eggMap 1.4s ease-in-out infinite }
        .egg-chemistry { animation:eggMolecule 1.1s ease-in-out infinite alternate }
        .egg-water i { position:absolute; bottom:-20px; display:block; border:2px solid rgba(255,255,255,.7); border-radius:50%; animation:eggBubble 2.8s ease-in infinite }
        @keyframes eggCoin { 0% { transform:translateY(-42px) rotateY(0); opacity:0 } 18% {opacity:1} 72% { transform:translateY(37px) rotateY(540deg); opacity:1 } 100% { transform:translateY(45px) rotateY(720deg) scale(.45); opacity:0 } }
        @keyframes eggRipple { 0% { transform:scale(.3); opacity:.9 } 100% { transform:scale(3.2,2); opacity:0 } }
        @keyframes eggFountain { 0%,100% { transform:scale(1) } 45% { transform:scale(1.08) translateY(-2px) } }
        @keyframes eggSwim { 0%,100% { transform:translateX(-9px) rotate(-3deg) } 50% { transform:translateX(9px) rotate(3deg) } }
        @keyframes eggShine { from { transform:scale(.92); filter:drop-shadow(0 0 1px #ffd76a) } to { transform:scale(1.08); filter:drop-shadow(0 0 12px #ffd76a) } }
        @keyframes eggMap { 0%,100% { transform:rotate(-3deg) scale(1) } 50% { transform:rotate(3deg) scale(1.08) } }
        @keyframes eggMolecule { from { transform:translateY(3px) rotate(-2deg) } to { transform:translateY(-4px) rotate(2deg) } }
        @keyframes eggBubble { 0% { transform:translateY(0) scale(.5); opacity:0 } 18% {opacity:.8} 100% { transform:translateY(-105vh) translateX(24px) scale(1.3); opacity:0 } }
        @keyframes eggWhale { 0% { transform:translate(-30vw,30px) rotate(-8deg); opacity:0 } 25% {opacity:1} 100% { transform:translate(95vw,-90px) rotate(5deg); opacity:0 } }
        .egg-reduced *, .egg-reduced *::before, .egg-reduced *::after { animation:none !important }
      `}</style>
    </Box>
  )
}
