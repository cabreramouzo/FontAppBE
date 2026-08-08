import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// PWA (Android/Chromium): captura `beforeinstallprompt` LO ANTES posible. Chrome
// puede dispararlo antes de que React monte; si en ese instante no hay listener, el
// evento se pierde y el banner "instalar app" no aparece. Lo guardamos en window para
// que InstallPrompt lo recoja aunque haya llegado antes.
declare global {
  interface Window { __bipEvent?: Event }
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__bipEvent = e
})

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

// PWA: registramos el service worker solo en producción (en dev interferiría con el HMR de Vite).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // sin SW la app sigue funcionando; solo no será instalable/offline
    })
  })
}

// Analítica web (Cloudflare Web Analytics): sin cookies, no rastrea entre sitios ni
// guarda datos personales. Solo en producción y solo si hay token configurado
// (VITE_CF_ANALYTICS_TOKEN). Si no está, no se carga ningún script de terceros.
const cfAnalyticsToken = import.meta.env.VITE_CF_ANALYTICS_TOKEN
if (import.meta.env.PROD && cfAnalyticsToken) {
  const beacon = document.createElement('script')
  beacon.defer = true
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: cfAnalyticsToken }))
  document.head.appendChild(beacon)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
