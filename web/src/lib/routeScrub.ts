/**
 * Dónde está el dedo sobre el perfil, compartido con el mapa.
 *
 * ## Por qué un módulo y no estado de React
 *
 * Recorrer el perfil dispara decenas de eventos por segundo. Subiendo ese kilómetro al
 * estado de `RouteWaterPage` —que es el padre común del perfil y del mapa— se repintaría
 * en cada uno **la lista entera**, que en una ruta normal son más de cien filas con sus
 * chips. El mismo argumento por el que `lib/asks.ts` vive en un módulo: los dos
 * interesados están en sitios distintos del árbol y el padre no pinta nada de esto.
 *
 * Con esto, quien se suscribe repinta y nadie más: solo el mapa.
 *
 * ## Un kilómetro, no unas coordenadas
 *
 * El perfil no sabe dónde está en el mundo —recibe kilómetro y altitud— y el mapa sí tiene
 * el trazado. Publicar el kilómetro deja la conversión donde están los datos para hacerla.
 */
let actual: number | null = null
const oyentes = new Set<() => void>()

/** El kilómetro señalado, o `null` si no se está señalando nada. */
export function kmSeñalado(): number | null {
  return actual
}

export function señala(km: number | null): void {
  if (actual === km) return
  actual = km
  for (const f of oyentes) f()
}

export function suscribe(f: () => void): () => void {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}
