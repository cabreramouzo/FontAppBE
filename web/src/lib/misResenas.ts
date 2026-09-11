/**
 * Qué fuentes he reseñado (con estado del agua) hace poco, en este dispositivo.
 *
 * Sirve para no naguear: si acabas de decir cómo está una fuente, preguntártelo otra vez
 * —los chips del globo del mapa, o el «¿cómo mana?» tras subir una foto en la ficha— es
 * ruido. `FontSummary` no lleva «lo reseñé yo», así que se recuerda en local al publicar
 * (también offline, al encolar). Es una comodidad por dispositivo, no una verdad del
 * servidor: si reseñas desde otro móvil no se entera, y como mucho vuelve a preguntar.
 *
 * Ventana de 24 h, la misma que el enfriamiento de auto-confirmación: dentro de ese día tu
 * parte es el actual y preguntarte no aporta; pasado, ya tiene sentido volver a preguntar.
 */
const CLAVE = 'fontapp:misResenas'
export const VENTANA_MS = 24 * 60 * 60 * 1000
const MAX = 300 // no crecer sin tope

/** ¿Es `t` (epoch ms) dentro de la ventana hasta `ahora`? Puro, para poder testearlo. */
export function esReciente(t: number, ahora: number, ventanaMs = VENTANA_MS): boolean {
  const edad = ahora - t
  return edad >= 0 && edad <= ventanaMs
}

function lee(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {} } catch { return {} }
}

/** Apunta que acabo de reseñar esta fuente. Poda de paso lo viejo y el exceso. */
export function apuntaResena(fontID: string, ahora = Date.now()): void {
  try {
    const r = lee()
    r[fontID] = ahora
    let vivas = Object.entries(r).filter(([, t]) => esReciente(t, ahora))
    if (vivas.length > MAX) vivas = vivas.sort((a, b) => b[1] - a[1]).slice(0, MAX)
    localStorage.setItem(CLAVE, JSON.stringify(Object.fromEntries(vivas)))
  } catch { /* modo privado: es solo una comodidad */ }
}

/** ¿He reseñado esta fuente dentro de la ventana? */
export function reseñadaHacePoco(fontID: string, ahora = Date.now()): boolean {
  const t = lee()[fontID]
  return typeof t === 'number' && esReciente(t, ahora)
}
