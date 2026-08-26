/**
 * Qué fuentes de la ruta se llevan al GPS.
 *
 * ## El problema, contado por quien lo tiene
 *
 * Lo pidió el mismo ciclista de los últimos metros, después de probar «Agua en mi ruta»:
 * *«al principio ya llevas agua de casa»*, así que las primeras fuentes del recorrido no
 * le sirven de nada, y *«en una ruta larga quizá hay demasiadas»*. Las dos frases son el
 * mismo problema — un GPX con treinta waypoints es una pantalla de iconos superpuestos en
 * un aparato de manillar, y los que estorban son justo los que ya sabes que no vas a usar.
 *
 * ## Se guardan las EXCLUIDAS, no las elegidas
 *
 * Parece lo mismo y no lo es. El corredor se puede cambiar después de elegir (100 m → 1 km),
 * y entonces aparecen fuentes que antes no estaban. Guardando las elegidas, esas nacerían
 * **fuera** y habría que acordarse de añadirlas; guardando las excluidas nacen dentro, que
 * es lo que espera cualquiera al ensanchar el corredor. Y «todas» —el estado de partida y
 * el de siempre hasta ahora— es el conjunto vacío, así que quien no toque nada exporta
 * exactamente lo que exportaba antes.
 *
 * ## Todo lo demás trabaja con CLAVES, no con objetos
 *
 * `claveDe` es el único sitio que mira dentro de una parada; el resto recibe `string[]`.
 * No es purismo: la primera versión pasaba a `seleccionadas` la lista de la pantalla tal
 * cual, cuyo id no está arriba sino en `.fuente.id`, así que la clave que calculaba no era
 * la misma que la de las casillas — se marcaban y el contador no se movía. Compilaba y
 * parecía correcto. Con `string[]` en la firma, ese error no llega a compilar.
 *
 * ## Y no se esconde nada de la lista
 *
 * Esto elige **qué se exporta**, no qué se ve. El tramo más seco es un hecho del recorrido
 * y no de lo que hayas marcado; y las fuentes que descartas para el GPS siguen siendo
 * fuentes por las que pasas, así que tienes que poder contar cómo estaban al volver. Una
 * selección que además filtrara la lista se llevaría por delante las dos cosas.
 */

/** Lo mínimo que necesita esta lógica de una parada. */
export interface ParadaSeleccionable {
  /** Identificador de la fuente. Opcional porque `FontSummary.id` lo es. */
  id?: string | null
  kmRuta: number
}

/**
 * La clave con la que se recuerda una parada.
 *
 * El id cuando lo hay, y si no el kilómetro, que es lo mismo que ya usa la lista como
 * `key` de React. Van juntas a propósito: dos claves distintas para la misma fila darían
 * una casilla que se marca y una exportación que no se entera.
 */
export function claveDe(parada: ParadaSeleccionable): string {
  return parada.id ?? `km:${parada.kmRuta}`
}

/** Marca o desmarca una parada. Devuelve un conjunto nuevo; no toca el que recibe. */
export function alterna(excluidas: ReadonlySet<string>, clave: string): Set<string> {
  const siguiente = new Set(excluidas)
  if (!siguiente.delete(clave)) siguiente.add(clave)
  return siguiente
}

/**
 * «Desde aquí»: deja marcadas esta parada y todas las de después.
 *
 * Es el caso que se contó tal cual —sales de casa con el bidón lleno— y en una lista de
 * treinta es un toque en vez de veintinueve. Escribe la selección entera de una vez en
 * lugar de superponerse a lo que hubiera: una regla que conviva con las casillas marcadas
 * a mano obliga a explicar cuál gana, y aquí lo que se ve marcado es siempre la verdad.
 *
 * El corte va por **posición en la lista y no por kilómetro**: dos fuentes pueden caer en
 * el mismo km con un decimal y comparar por número dejaría fuera a la que se ha tocado.
 */
export function soloDesde(claves: readonly string[], clave: string): Set<string> {
  const desde = claves.indexOf(clave)
  if (desde < 0) return new Set()
  return new Set(claves.slice(0, desde))
}

/** Las claves que sí se llevan, en el orden en que se pedalea. */
export function seleccionadas(
  claves: readonly string[],
  excluidas: ReadonlySet<string>,
): string[] {
  return claves.filter((c) => !excluidas.has(c))
}
