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
export const LEVEL_BADGES = new Set(['drop','spring', 'brook', 'torrent', 'stream', 'river', 'waterfall', 'reservoir', 'lake', 'aquifer'])

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

/**
 * Familias con insignia dibujada, en `public/badges/`.
 *
 * Las de bronce/plata/oro usan **el mismo dibujo en los tres grados** y el grado lo
 * lleva el aro de color que les pone `BadgeArt`. Tres ficheros por familia serían 24
 * imágenes que hay que rehacer cada vez que se toque el estilo, y a 88 px la diferencia
 * entre un escudo bronce y uno plata se ve en el marco mucho antes que en el dibujo.
 *
 * Sin entrada aquí, la familia sale con el icono coloreado de `BadgeIcon`.
 */
export const BADGE_ART = new Set([
  'pioneer', 'discoverer', 'firstLight', 'sentinel', 'cartographer', 'drySeason',
  'fourSeasons', 'counties', 'incidents', 'farAway', 'offline',
  'guardianLocal', 'waterRecovered', 'routes', 'verifier', 'fountainRescued',
  'international', 'consistency', 'reunion', 'teamwork', 'incidentResolved',
])

export function badgeArtURL(family: string): string | null {
  if (!BADGE_ART.has(family)) return null
  return `/badges/${family}.png?v=${VERSION}`
}
