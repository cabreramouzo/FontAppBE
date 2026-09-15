// Genérico y sin importar `FontSummary`: el almacén es JSON opaco y así el módulo no
// arrastra ningún tipo de `../api/types` (que además rompía el typecheck en este fichero).
// Quien llama pone el tipo real.
type ConId = { id?: string }

/**
 * Las fuentes que el mapa ha cargado hace poco, para que la **ficha funcione offline sin
 * haber guardado zona**.
 *
 * El caso reportado en el campo: ves el pin en el mapa, pierdes cobertura, tocas la fuente
 * y sale «sin conexión con el servidor». La ficha solo caía a la zona guardada, y si no
 * habías guardado ninguna no había nada que enseñar — absurdo, porque el resumen de esa
 * fuente (nombre, estado, potabilidad, coordenadas) YA lo tiene el mapa: es lo que pinta
 * el pin. Aquí se guarda ese resumen y la ficha tira de él cuando falla la red.
 *
 * En `sessionStorage` a propósito: el popup del mapa navega con un `<a href>` de verdad
 * (recarga completa), así que la memoria del módulo se pierde; `sessionStorage` sobrevive
 * a esa navegación dentro de la pestaña, que es justo el trayecto «veo el pin → lo toco».
 * No son las reseñas —esas no están— pero sí lo esencial y la flecha de los últimos
 * metros, que es lo que sirve estando delante.
 */
const CLAVE = 'fontapp_fuentes_vistas'
const TOPE = 1500

/**
 * Fusiona las recién vistas sobre las previas y capa al tope, quedándose con las más
 * recientes. Pura y testable (el resto toca `sessionStorage` y no se puede en Node).
 */
export function mezclaVistas<T extends ConId>(
  prev: Record<string, T>,
  nuevas: T[],
  tope = TOPE,
): Record<string, T> {
  const out: Record<string, T> = { ...prev }
  for (const f of nuevas) {
    if (!f.id) continue
    delete out[f.id] // reinsertar la lleva al final = más reciente para el recorte
    out[f.id] = f
  }
  const ids = Object.keys(out)
  for (const id of ids.slice(0, Math.max(0, ids.length - tope))) delete out[id]
  return out
}

function leer<T>(): Record<string, T> {
  try {
    const s = sessionStorage.getItem(CLAVE)
    return s ? (JSON.parse(s) as Record<string, T>) : {}
  } catch {
    return {}
  }
}

/** Apunta las fuentes que el mapa acaba de cargar. */
export function recuerdaVistas<T extends ConId>(fonts: T[]): void {
  if (!fonts.length) return
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(mezclaVistas(leer<T>(), fonts)))
  } catch {
    /* sin sessionStorage (modo privado antiguo): la ficha offline caerá solo a la zona */
  }
}

/** El resumen de una fuente vista en el mapa, o `null` si no se ha visto. */
export function fuenteVista<T extends { id: string } = { id: string }>(id: string): T | null {
  return leer<T>()[id] ?? null
}
