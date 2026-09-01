import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startOutboxAutoFlush } from './lib/outbox'
import { captureSource } from './lib/campaign'
import { trackCampaignVisit, trackInteraction } from './api/client'
import { recargaSiEsTrozoCaducado } from './lib/staleChunk'

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
  trackInteraction('install_available')
})

// Cuando el usuario instala la app, lo recordamos para no volver a ofrecer el banner
// ni siquiera si más tarde abre la web en el navegador normal (donde no podríamos
// detectar la instalación de otra forma).
window.addEventListener('appinstalled', () => {
  try { localStorage.setItem('fontapp_installed', '1') } catch { /* modo privado: da igual */ }
  window.__bipEvent = undefined
  trackInteraction('install_success')
})

// El zoom de la página está PERMITIDO: hay quien lo necesita para leer, y bloquearlo
// con `user-scalable=no` incumple la pauta de accesibilidad de redimensionar el texto.
// Lo único que se bloquea es el pinch DENTRO del mapa, donde el gesto ya significa otra
// cosa (acercar el mapa) y dejar que además se ampliara la página descuadraba la
// interfaz. iOS Safari dispara `gesture*` aunque el CSS diga `touch-action: none`.
const enElMapa = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('.leaflet-container')
document.addEventListener('gesturestart', (e) => { if (enElMapa(e.target)) e.preventDefault() })
document.addEventListener('gesturechange', (e) => { if (enElMapa(e.target)) e.preventDefault() })

// PWA: registramos el service worker solo en producción (en dev interferiría con el HMR de Vite).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // El origen de la API viaja en la URL del propio service worker.
    //
    // Hace falta porque el SW es un fichero estático de `public/`: Vite no lo procesa, así
    // que no puede leer `VITE_API_URL`. Y sin saberlo no cacheaba **ni una** respuesta de
    // la API en producción, donde el backend está en otro dominio — el filtro de
    // `pathname.startsWith('/api')` solo acierta en desarrollo, con el proxy de Vite.
    //
    // En la URL y no por `postMessage` porque el navegador mata y revive el SW cuando le
    // parece: un dato en memoria se pierde, y `self.location` no.
    const api = import.meta.env.VITE_API_URL || ''
    const sw = api ? `/sw.js?api=${encodeURIComponent(api)}` : '/sw.js'
    navigator.serviceWorker.register(sw).catch(() => {
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

// Guarda el código del cartel (?p=…) antes de que nada toque la URL.
// El servidor valida el formato del código: la ruta es pública y esto viene de la URL,
// así que la puerta está allí y no aquí.
const codigoDeCampana = captureSource()
if (codigoDeCampana) void trackCampaignVisit(codigoDeCampana)

// Envía lo que quedó guardado sin cobertura: al arrancar y al recuperar la red.
startOutboxAutoFlush()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Vite avisa cuando falla la precarga de un trozo, **antes** de que React llegue a lanzar.
// Cogerlo aquí es más limpio que esperar a la barrera de error: se recarga y la persona no
// llega a ver nada raro. Ver `lib/staleChunk.ts` para por qué esto no es un error de la
// pantalla sino una versión caducada.
window.addEventListener('vite:preloadError', (e) => {
  if (recargaSiEsTrozoCaducado((e as { payload?: unknown }).payload ?? new Error('vite:preloadError'))) {
    e.preventDefault()
  }
})
