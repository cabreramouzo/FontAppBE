/**
 * Nombres de país para la interfaz.
 *
 * `fonts.country` guarda **lo que dice Natural Earth**, o sea el nombre en inglés:
 * «Spain», «France», «Chile». Eso vale como clave y no vale como rótulo — la app está en
 * seis idiomas y ninguno de ellos es «el inglés de un fichero de fronteras».
 *
 * Se traduce por lista explícita y **no** con `t()` a pelo, porque `t()` devuelve la
 * clave cruda cuando no la encuentra: el día que se importe Alemania, un `t('country.
 * Germany')` sin traducir pintaría literalmente «country.Germany» en el selector. Con
 * esto, un país que no esté en la lista sale con su nombre tal cual, que es feo pero
 * cierto y no rompe nada.
 *
 * Al importar un país nuevo: añadirlo aquí y añadir sus seis traducciones. Si se olvida,
 * se nota poco y no se rompe nada — de ahí el aviso.
 */
/**
 * Los países que la app conoce, **de más fuentes a menos**.
 *
 * Es la lista que pinta el selector de `/activity`, que no puede sacarla de los datos
 * cargados como hace con las demarcaciones: filtrando por uno, lo cargado solo tendría
 * ese, y no habría forma de volver ni de cambiar. `/zones` sí la deriva de su respuesta,
 * que trae todas las zonas de una vez.
 *
 * Consecuencia asumida: un país importado y no apuntado aquí **sale en `/zones` y no en
 * el selector de novedades**. Es la misma regla que las traducciones —al importar un
 * país, se añade aquí— y por eso van juntas: una lista, un sitio, un despiste posible.
 */
export const PAISES = ['Spain', 'France', 'Portugal', 'Sweden', 'Finland', 'Chile', 'Andorra']

const TRADUCIDOS = new Set(PAISES)

/** La clave de i18n de un país, o `null` si no lo tenemos traducido. */
export function clavePais(bruto: string): string | null {
  return TRADUCIDOS.has(bruto) ? `country.${bruto}` : null
}

/** El nombre a pintar, con `t` inyectada para no depender del contexto aquí. */
export function nombrePais(bruto: string, t: (k: string) => string): string {
  const clave = clavePais(bruto)
  return clave ? t(clave) : bruto
}

/**
 * Los países presentes en una lista de zonas, **ordenados por número de fuentes**.
 *
 * Por fuentes y no alfabéticamente: el selector lo lee alguien que busca su país, y el
 * orden alfabético pondría primero a Andorra (2 fuentes) delante de España (52.000).
 */
export function paisesDe(zonas: { country: string | null; fonts: number }[]): string[] {
  const suma = new Map<string, number>()
  for (const z of zonas) {
    if (!z.country) continue
    suma.set(z.country, (suma.get(z.country) ?? 0) + z.fonts)
  }
  return [...suma.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
}


/**
 * El país elegido, **compartido entre `/zones` y `/activity`**.
 *
 * Es una sola preferencia y no dos: quien mira las zonas de Chile quiere las novedades
 * de Chile, y tener que decirlo en cada pestaña convierte un acierto en una tarea. Vive
 * aquí y no en una de las dos pantallas para que la tercera que lo necesite no tenga que
 * importar de la segunda.
 */
const RECUERDO = 'zones:country'

/** Elegido explícitamente «todos». No es lo mismo que no haber elegido nunca. */
export const TODOS = '*'

export function paisRecordado(): string | null {
  try { return localStorage.getItem(RECUERDO) } catch { return null }
}

export function recuerdaPais(pais: string): void {
  try { localStorage.setItem(RECUERDO, pais) } catch { /* modo privado: da igual */ }
}
