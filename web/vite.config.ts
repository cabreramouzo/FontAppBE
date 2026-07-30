import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En dev, /api -> backend Vapor (evita CORS y hardcodear el puerto).
// Mismo proxy en dev (`server`) y al servir el build (`preview`), para poder
// probar la PWA/service worker del build de producción contra el backend local.
const proxy = {
  '/api': {
    target: 'http://127.0.0.1:8080',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
  // Imágenes subidas servidas por el backend en /uploads.
  '/uploads': {
    target: 'http://127.0.0.1:8080',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
