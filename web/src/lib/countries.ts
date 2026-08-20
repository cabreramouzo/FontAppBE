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
const TRADUCIDOS = new Set(['Spain', 'France', 'Portugal', 'Andorra', 'Chile'])

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
