/**
 * Qué niveles tienen ya su insignia dibujada.
 *
 * Es una lista explícita y no un intento de cargar `/levels/<clave>.png` a ver si
 * está: pedir una que no existe da un 404 en la consola en cada visita y un hueco
 * que parpadea antes de rendirse. Mientras falten, el nivel se enseña solo con su
 * nombre, que es lo que ya hacía.
 *
 * Al añadir una nueva (ver `scripts/prepara-insignias.py`), añade aquí su clave.
 */
export const LEVEL_BADGES = new Set(['drop'])

/**
 * Los ficheros viven en `public/`, así que **no llevan hash en el nombre** y el
 * service worker los sirve con `cacheFirst`. Si se redibuja una insignia hay que
 * subir esta versión o la gente seguirá viendo la vieja para siempre.
 */
const VERSION = 1

export function levelBadgeURL(levelKey: string): string | null {
  if (!LEVEL_BADGES.has(levelKey)) return null
  return `/levels/${levelKey}.png?v=${VERSION}`
}
