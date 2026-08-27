/**
 * Tamaños legibles.
 *
 * Vive **aparte de `lib/almacen.ts`** por la misma razón que `lib/apiError.ts` se separó de
 * `api/client.ts`: aquel toca `navigator` y el service worker, así que no se puede importar
 * desde un test de Node — y esto es justo lo que hay que probar, porque son todo casos
 * límite (el corte de unidad, el separador decimal, el francés) que fallan en silencio.
 */
/**
 * Un tamaño en la unidad que se entiende, y en el idioma de quien lee.
 *
 * Salía en MB siempre, así que la cuota del navegador se leía como «39186.8 MB libres»: un
 * número que nadie sabe cuánto es. Y el punto decimal tampoco era el nuestro.
 *
 * Lo hace `Intl` entero —el separador decimal **y** el nombre de la unidad—, que además
 * acierta con el francés, donde son «Mo» y «Go». Escribir la unidad a mano en los ocho
 * diccionarios habría sido una lista paralela que se separa del corte de unidad a la
 * primera; así el idioma solo pone la frase y la cifra viene formateada.
 *
 * El corte va en 1.024, no en 1.000: es lo que espera quien mira el espacio de un móvil.
 * Por debajo de un mega se dice en KB, o una instalación recién hecha diría «0,0 MB» y
 * parecería que la pantalla está rota.
 */
export function formateaTamano(bytes: number, lang: string): string {
  const KB = 1024
  const [valor, unidad] =
    bytes >= KB ** 3 ? [bytes / KB ** 3, 'gigabyte']
    : bytes >= KB ** 2 ? [bytes / KB ** 2, 'megabyte']
    : [bytes / KB, 'kilobyte']
  try {
    return new Intl.NumberFormat(lang, {
      style: 'unit', unit: unidad, unitDisplay: 'short', maximumFractionDigits: 1,
    }).format(valor)
  } catch {
    // `style: 'unit'` es de 2020; en un navegador viejo se dice en inglés antes que caerse.
    return `${valor.toFixed(1)} ${unidad === 'gigabyte' ? 'GB' : unidad === 'megabyte' ? 'MB' : 'kB'}`
  }
}

