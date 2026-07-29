import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Evita el zoom de página por pinch/doble-toque (iOS Safari lo hace aunque el
// viewport diga user-scalable=no). El mapa de Leaflet usa touchmove dentro de su
// contenedor, así que su propio pinch-zoom sigue funcionando; esto solo bloquea el
// gesto a nivel de documento, que es el que descuadraba la UI.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('gesturechange', (e) => e.preventDefault())

// Doble-toque para hacer zoom (iOS): lo suprimimos fuera del mapa.
let lastTouch = 0
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now()
    if (now - lastTouch <= 300 && !(e.target as HTMLElement)?.closest?.('.leaflet-container')) {
      e.preventDefault()
    }
    lastTouch = now
  },
  { passive: false },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
