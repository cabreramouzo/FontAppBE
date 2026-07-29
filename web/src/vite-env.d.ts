/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origen del backend en producción (p. ej. https://api.fontapp.com). Vacío en dev (proxy de Vite). */
  readonly VITE_API_URL?: string
}
