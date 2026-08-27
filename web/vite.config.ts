import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Identificador compartido por el bundle y `/version.json`. Lleva la hora además del
// commit porque un redespliegue del mismo commit puede cambiar variables VITE_*.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

const buildId = `${process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'local'}-${Date.now()}`

// La hora del build, aparte del identificador.
//
// El número de versión lo subes tú y contesta «qué release es esto». La fecha la pone el
// build y contesta la otra pregunta, que es la que de verdad hace falta cuando alguien
// reporta algo: **si tiene el despliegue de hace cinco minutos o el de ayer**. En una
// tarde de quince commits, la versión sola no distingue nada.
const buildTime = new Date().toISOString()

// En dev, /api -> backend Vapor (evita CORS y hardcodear el puerto).
// Mismo proxy en dev (`server`) y al servir el build (`preview`), para poder
// probar la PWA/service worker del build de producción contra el backend local.
// `API_TARGET` para poder levantar un segundo front contra un backend en otro puerto
// sin tocar el que ya está corriendo. Por defecto, el de siempre.
const target = process.env.API_TARGET || 'http://127.0.0.1:8080'

const proxy = {
  '/api': {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
  // Imágenes subidas servidas por el backend en /uploads.
  '/uploads': { target, changeOrigin: true },
  // Ilustraciones de las fuentes de ejemplo (`seed --demo`), que viven en el Public/
  // del backend. Sin esto salen rotas en desarrollo y la demo se ve a medias.
  '/demo': { target, changeOrigin: true },
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    {
      name: 'fontapp-build-version',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: buildId }),
        })
      },
    },
  ],
  server: { proxy },
  preview: { proxy },
})
