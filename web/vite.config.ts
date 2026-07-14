import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En dev, /api -> backend Vapor (evita CORS y hardcodear el puerto).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Imágenes subidas servidas por el backend en /uploads.
      '/uploads': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
