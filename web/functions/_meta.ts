/**
 * Ayudas compartidas de las funciones de Cloudflare Pages.
 *
 * Los ficheros que empiezan por `_` no son rutas, así que este no se sirve.
 */

export interface Env {
  /** Origen del backend. Pages expone las variables del panel también en tiempo de
   *  ejecución, así que la misma `VITE_API_URL` que usa el build vale aquí y no hay que
   *  configurar nada nuevo. `API_ORIGIN` existe solo por si algún día se separan. */
  API_ORIGIN?: string
  VITE_API_URL?: string
  /** Stripe only exists at runtime in Pages Functions. Never expose these as VITE_ vars:
   *  Vite deliberately embeds those in the browser bundle. */
  STRIPE_SECRET_KEY?: string
  STRIPE_ONE_TIME_PRICE_ID?: string
  STRIPE_MONTHLY_PRICE_ID?: string
}

/** El origen del backend, o `null` si no está configurado. */
export function apiOrigin(env: Env): string | null {
  const raw = (env.API_ORIGIN || env.VITE_API_URL || '').trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(raw) ? raw : null
}

/** Escapa para meterlo dentro de un atributo HTML o de un nodo de texto XML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Recorta sin partir una palabra por la mitad. */
export function recorta(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max)
  const espacio = corte.lastIndexOf(' ')
  return (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd() + '…'
}

/**
 * El origen **canónico** del sitio para esta petición.
 *
 * `www.fontapp.net` y `fontapp.net` sirven los dos un 200 con el mismo contenido — no hay
 * redirección entre ellos. Con una canónica auto-referente, cada ficha existiría dos veces
 * para un buscador y se repartiría la señal entre las dos copias, que es peor que no poner
 * canónica. Se quita el `www.` y con eso las dos apuntan a la misma.
 */
export function siteOrigin(req: Request): string {
  const u = new URL(req.url)
  u.hostname = u.hostname.replace(/^www\./, '')
  return u.origin
}
