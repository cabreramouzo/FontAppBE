/**
 * Cuándo el punto azul se convierte en una flecha de navegación (estilo Apple Maps).
 *
 * La idea la pidió alguien que busca fuentes en coche: yendo rápido, un punto no dice
 * hacia dónde vas. Apple Maps orienta una flecha al **rumbo de viaje** —la dirección del
 * movimiento según el GPS—, no a la brújula, que en un coche baila (el móvil tumbado en
 * un soporte, con interferencias del metal). Y el rumbo de viaje **no necesita permiso de
 * sensor**: sale del propio desplazamiento.
 *
 * Puro y con tests porque son ángulos y umbrales, que fallan en silencio.
 */

/**
 * Umbrales de velocidad (m/s) con **histéresis**, para no parpadear entre punto y flecha
 * en el borde. Encender a ~10 km/h (claramente en marcha: bici o coche) y no apagar hasta
 * bajar de ~4 km/h (paso ligero). Entre medias se conserva el estado anterior.
 */
export const VEL_NAV_ON = 2.8
export const VEL_NAV_OFF = 1.1

/**
 * ¿Flecha (navegando) o punto? Con histéresis: encendido aguanta hasta bajar de OFF;
 * apagado no enciende hasta pasar ON. Sin rumbo válido, nunca flecha —una flecha sin
 * dirección fiable es peor que un punto—.
 */
export function decideNavegando(velMs: number | null, rumbo: number | null, previo: boolean): boolean {
  if (rumbo === null) return false
  const v = velMs ?? 0
  return previo ? v >= VEL_NAV_OFF : v >= VEL_NAV_ON
}

/**
 * Velocidad en m/s: la del GPS si la da (instantánea y fiable), y si no, la media del
 * tramo (distancia/tiempo). Muchos móviles rellenan `coords.speed`; algunos no, y ahí el
 * respaldo evita quedarse sin modo navegación.
 */
export function velocidadMs(speedGps: number | null | undefined, distMetros: number, dtSegundos: number): number {
  if (typeof speedGps === 'number' && Number.isFinite(speedGps) && speedGps >= 0) return speedGps
  if (dtSegundos > 0 && Number.isFinite(distMetros)) return distMetros / dtSegundos
  return 0
}

/**
 * Rumbo (0 = N, 90 = E) del punto `a` al `b` sobre el terreno. `null` si no se han movido
 * lo bastante para que el rumbo signifique algo: el GPS baila unos metros estando quieto,
 * y calcular el rumbo de ese temblor daría una flecha girando sola en un semáforo.
 */
export function rumboEntre(a: [number, number], b: [number, number], minMetros = 8): number | null {
  const [lat1, lon1] = a
  const [lat2, lon2] = b
  const rad = Math.PI / 180
  // Distancia aproximada en metros (equirectangular; sobra para un umbral de unos metros).
  const R = 6371000
  const dLatM = (lat2 - lat1) * rad * R
  const dLonM = (lon2 - lon1) * rad * R * Math.cos((lat1 + lat2) / 2 * rad)
  if (Math.hypot(dLatM, dLonM) < minMetros) return null
  const f1 = lat1 * rad
  const f2 = lat2 * rad
  const dl = (lon2 - lon1) * rad
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
