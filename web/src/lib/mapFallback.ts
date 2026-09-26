/**
 * Qué fuentes deja el mapa cuando un refresco de `/fonts/map` FALLA (sin cobertura, 429,
 * 5xx…).
 *
 * La regla, y es la que faltaba: **un refresco fallido no puede vaciar el mapa.** Los
 * puntos que ya estaban en pantalla se cargaron con una petición que sí funcionó (o del
 * caché del service worker) y siguen siendo válidos; que la siguiente falle no los borra.
 *
 * Antes, sin zona guardada el `catch` ponía `[]` y **desaparecían todos los marcadores en
 * cuanto se iba la cobertura** — reportado en el campo: «se veían las fuentes y al perder
 * cobertura desaparecieron todos los puntos del caché, no tiene sentido». Con zona
 * guardada sí hay respaldo real; sin ella, se conserva lo que hubiera.
 *
 * Ojo con el caso que se coló la primera vez: `deZona` puede venir **vacío** (`[]`), no
 * solo `null` — pasa cuando SÍ hay zona guardada pero estás **fuera de su caja**
 * (`enCaja` filtra y no queda ninguna). Un `?? ` no lo cubre (`[] ?? x` es `[]`), así que
 * vaciaba el mapa igual. La regla es más simple: solo se reemplaza cuando el respaldo
 * tiene fuentes de verdad; si no, se conserva lo que ya estaba. Nunca se reduce a vacío
 * por un fallo.
 *
 * @param previas  Las que ya se están pintando.
 * @param deZona   Las de la zona guardada (puede ser `[]`), o `null` si no hay zona.
 */
export function fuentesTrasFalloDeRed<T>(previas: T[], deZona: T[] | null): T[] {
  return deZona && deZona.length > 0 ? deZona : previas
}

interface Box { minLat: number; maxLat: number; minLong: number; maxLong: number }

/**
 * Whether the saved offline zone can stand in for this view after a failed refresh.
 *
 * Only when it covers at least half of what is on screen. Zoomed out over the world, a
 * failed request — a timeout while Neon wakes up is enough — used to swap the whole map
 * for the dozen fountains of the saved zone, drawn as one cluster over Barcelona, as if
 * those were all there are. A zone answers for its own valley, not for a continent.
 */
export function zonaCubreLaVista(zona: Box, vista: Box): boolean {
  const ancho = Math.min(zona.maxLong, vista.maxLong) - Math.max(zona.minLong, vista.minLong)
  const alto = Math.min(zona.maxLat, vista.maxLat) - Math.max(zona.minLat, vista.minLat)
  if (ancho <= 0 || alto <= 0) return false
  const areaVista = (vista.maxLong - vista.minLong) * (vista.maxLat - vista.minLat)
  return areaVista > 0 && (ancho * alto) / areaVista >= 0.5
}
