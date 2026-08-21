import type { WaterSource } from '../api/types.js'

/**
 * Cómo se llama una fuente en pantalla.
 *
 * ## El problema que resuelve
 *
 * Tres de cada cuatro puntos importados de OpenStreetMap **no tienen nombre**. Durante
 * meses se les escribió un relleno en el idioma del territorio —«Font», «Fuente»,
 * «Fontaine», «Vattenpost», «Vesiposti»— y se guardó en la base de datos como si fuera su
 * nombre. Parecía razonable: el dato, en el idioma de donde sale.
 *
 * Y confunde **el idioma del territorio con el idioma de quien lee**, que son cosas
 * distintas. Un dato no tiene idioma; una interfaz sí. Medido sobre producción, el 47 % de
 * las fuentes mostraba una palabra que el lector podía no entender: un español en
 * Estocolmo veía «Vattenpost» 1.310 veces, y un sueco en Cataluña ve «Font».
 *
 * Ahora el servidor manda `name: null` cuando no hay nombre, que es la verdad, y el rótulo
 * se compone aquí con **el tipo de fuente** y el idioma del lector.
 *
 * ## Por qué el tipo y no un «sin nombre»
 *
 * Porque el tipo **dice algo útil**: «Fuente natural» y «Fuente urbana (red)» no prometen
 * lo mismo — una tiene caudal garantizado y agua tratada, la otra puede estar seca en
 * agosto. Es exactamente lo que quiere saber quien mira el mapa antes de desviarse. Un
 * «Fuente sin nombre» ocuparía el mismo hueco sin decir nada.
 *
 * (El correo semanal sí dice «Fuente sin nombre», y es a propósito: allí se cuenta lo que
 * ha pasado, no qué clase de fuente es, y el tipo sería ruido. Está anotado en
 * `WeeklyDigestEmail`.)
 *
 * ## Los topónimos no se traducen, nunca
 *
 * «Pilgrimskällan» o «Font de la Teula» se pintan tal cual. Son nombres propios:
 * traducirlos impediría preguntar por la fuente, reconocer el cartel clavado en la piedra
 * o encontrarla en OSM. Esta función solo actúa cuando **no hay** nombre.
 */
export function nombreFuente(
  font: { name?: string | null; source?: WaterSource | null },
  t: (k: string) => string,
): string {
  if (font.name) return font.name
  // `source` también puede faltar. Sin tipo no se puede decir qué clase de fuente es, así
  // que se dice lo único cierto: que no tiene nombre.
  return t(font.source ? `source.${font.source}` : 'font.unnamed')
}

/**
 * Igual que `nombreFuente` pero cuando lo único que se tiene es el nombre.
 *
 * Es el caso de la campana y del historial de ediciones: guardan **una copia** del nombre
 * y no una referencia a la fuente —un aviso es la foto de lo que pasó—, así que ahí no hay
 * `source` que consultar. Sin tipo, lo único cierto es que no tenía nombre.
 */
export function rotulo(name: string | null | undefined, t: (k: string) => string): string {
  return name || t('font.unnamed')
}
