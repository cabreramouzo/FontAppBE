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

/** Días transcurridos desde que se importó. */
export function diasDesde(cuando: string, ahora = Date.now()): number {
  return Math.max(0, Math.floor((ahora - Date.parse(cuando)) / 86_400_000))
}
