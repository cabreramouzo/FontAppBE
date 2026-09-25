// Con extensión: este módulo lo carga también `node --test`, que la exige.
import type { PuntoRuta } from './gpxImport.ts'

/**
 * Recordar la última ruta importada, para poder contar cómo estaban las fuentes **al volver**.
 *
 * ## Por qué existe
 *
 * Sin esto, el círculo no se cierra. Quien importa un GPX lo hace **antes** de salir; lo
 * que vio en las fuentes lo sabe **después**, y para entonces tendría que volver a buscar
 * el fichero en el móvil, encontrarlo y subirlo otra vez. Nadie hace eso, así que la
 * información que más vale —la de quien acaba de estar delante— se pierde entera.
 *
 * Guardando el recorrido, al volver a abrir la pantalla ya está su ruta puesta y solo hay
 * que tocar tres chips.
 *
 * ## No sale del dispositivo, y esto es lo de siempre con un GPX
 *
 * Un recorrido es por dónde se mueve una persona. Vive en `localStorage`, separado por
 * cuenta como el historial de búsquedas, y se puede olvidar con un botón.
 */

const CLAVE = (scope: string) => `route:last:v1:${scope}`
const TRANSFER_KEY = 'route:transfer:v1'
const TRANSFER_TTL = 10 * 60 * 1000

interface Store {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Tope de puntos que se guardan.
 *
 * Un GPX de un Garmin trae un punto por segundo; ya viene simplificado a 25 m, pero una
 * ruta larga sigue siendo miles. `localStorage` ronda los 5 MB por origen y lo comparte
 * con la sesión, las preferencias y la bandeja de salida sin conexión — que es lo único
 * aquí que **no se puede perder**, porque son aportaciones que aún no se han enviado.
 * 4.000 puntos son unos 200 km a 50 m y ocupan del orden de 150 KB.
 */
export const MAX_PUNTOS = 4000

export interface RutaRecordada {
  nombre: string
  /** Cuándo se importó, en ISO. Sirve para decir «hace dos días» y para no insistir. */
  cuando: string
  puntos: PuntoRuta[]
}

/**
 * Guarda la ruta. Si no cabe, **no se guarda** y no se rompe nada.
 *
 * `localStorage` lanza cuando se llena, y aquí eso no puede tirar la pantalla ni, mucho
 * menos, comerse el sitio que necesita la bandeja de salida.
 */
export function recuerdaRuta(ruta: RutaRecordada, scope: string): boolean {
  try {
    const recorte = { ...ruta, puntos: ruta.puntos.slice(0, MAX_PUNTOS) }
    localStorage.setItem(CLAVE(scope), JSON.stringify(recorte))
    return true
  } catch {
    return false
  }
}

/** La ruta recordada, o `null`. Devuelve `null` ante cualquier cosa que no cuadre. */
export function rutaRecordada(scope: string): RutaRecordada | null {
  try {
    const crudo = localStorage.getItem(CLAVE(scope))
    if (!crudo) return null
    const r = JSON.parse(crudo) as Partial<RutaRecordada>
    if (!r || typeof r.nombre !== 'string' || !Array.isArray(r.puntos) || r.puntos.length < 2) return null
    if (typeof r.cuando !== 'string' || Number.isNaN(Date.parse(r.cuando))) return null
    // Los puntos vienen de un fichero de fuera y han pasado por el disco: se comprueban.
    // Un `lat` que sea texto no da error hasta que alguien hace cuentas con él, y para
    // entonces el fallo aparece como distancias absurdas y no como un dato malo.
    const puntos = r.puntos.filter((p) => (
      p && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
    ))
    if (puntos.length < 2) return null
    return { nombre: r.nombre, cuando: r.cuando, puntos }
  } catch {
    return null
  }
}

export function olvidaRuta(scope: string): void {
  try { localStorage.removeItem(CLAVE(scope)) } catch { /* modo privado */ }
}

interface RouteTransferIntent {
  token: string
  createdAt: number
  route: RutaRecordada
}

/**
 * Preserve the anonymous route across the real document navigation used by auth.
 *
 * The intent lives in `sessionStorage`: it belongs to this tab and this login attempt.
 * The token also travels in the internal return URL, so merely opening `/gpx` while
 * signed in can never expose or adopt an anonymous route left on the device.
 */
export function prepareRouteTransfer(
  store: Store, route: RutaRecordada, token: string, now = Date.now(),
): string {
  try {
    store.setItem(TRANSFER_KEY, JSON.stringify({ token, createdAt: now, route }))
  } catch {
    // Private mode or a full store must not break the route or the login link.
  }
  return `/gpx?routeTransfer=${encodeURIComponent(token)}`
}

/** Read a valid pending transfer without consuming the user's decision. */
export function pendingRouteTransfer(
  store: Store, token: string, now = Date.now(),
): RutaRecordada | null {
  const raw = store.getItem(TRANSFER_KEY)
  if (!raw) return null
  try {
    const intent = JSON.parse(raw) as Partial<RouteTransferIntent>
    if (intent.token !== token || typeof intent.createdAt !== 'number'
        || now < intent.createdAt || now - intent.createdAt >= TRANSFER_TTL) return null
    const route = intent.route as Partial<RutaRecordada> | undefined
    if (!route || typeof route.nombre !== 'string' || typeof route.cuando !== 'string'
        || !Array.isArray(route.puntos) || route.puntos.length < 2) return null
    const points = route.puntos.filter((point) => (
      point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180
    ))
    if (points.length < 2 || Number.isNaN(Date.parse(route.cuando))) return null
    return { nombre: route.nombre, cuando: route.cuando, puntos: points }
  } catch {
    return null
  }
}

/**
 * Consume the decision once. Rejecting only discards the transfer intent; accepting
 * writes to the selected account after the UI has warned about any existing route.
 */
export function resolveRouteTransfer(
  store: Store, token: string, targetScope: string, accept: boolean, now = Date.now(),
): RutaRecordada | null {
  const route = pendingRouteTransfer(store, token, now)
  store.removeItem(TRANSFER_KEY)
  if (!accept || !route || targetScope === 'anonymous') return null
  return recuerdaRuta(route, targetScope) ? route : null
}

export function clearRouteTransfer(store: Store): void {
  store.removeItem(TRANSFER_KEY)
}

/** Días transcurridos desde que se importó. */
export function diasDesde(cuando: string, ahora = Date.now()): number {
  return Math.max(0, Math.floor((ahora - Date.parse(cuando)) / 86_400_000))
}
