/**
 * Bajar de antemano las pantallas que tienen que funcionar sin cobertura.
 *
 * ## El problema
 *
 * Las páginas van en trozos (`lazy()`), y un trozo solo entra en el caché **la primera vez
 * que se abre esa pantalla**. Así que quien guardaba una zona, se iba al monte y tocaba
 * una fuente se encontraba con que el trozo de la ficha nunca se había pedido: sin red, no
 * hay de dónde bajarlo.
 *
 * Y encima el mensaje mentía. `esTrozoCaducado` reconoce ese fallo por el texto del error
 * —«failed to fetch dynamically imported module»— que es **el mismo** que produce un
 * despliegue nuevo, así que la app decía «se ha actualizado, recarga para seguir» en
 * pleno modo avión. Reportado con una captura.
 *
 * ## Cuáles, y por qué solo ésas
 *
 * Las que de verdad sirven sin red, que son las que leen de lo guardado en el móvil:
 *
 * - **La ficha de una fuente**: sale de la zona guardada y lleva la flecha de los últimos
 *   metros, o sea lo único que sirve estando delante de la fuente.
 * - **Agua en mi ruta**: el recorrido está en `localStorage` y sus fuentes, fijadas.
 *
 * El mapa no hace falta: es la pantalla de inicio y su trozo ya está cargado. Y las demás
 * —zonas, novedades, perfil, administración— no funcionan sin servidor, así que
 * precargarlas sería gastar datos de alguien para que le salga un error más bonito.
 *
 * ## Con cuidado de no estorbar
 *
 * Se espera a que el arranque haya pasado y solo se hace **con red**. Son unas decenas de
 * KB, pero pedirlos mientras se pinta el mapa compite con lo que la persona está mirando.
 */

/** Lo que se tarda en dejar de estorbar al primer pintado. */
const ESPERA_MS = 4000

export function precargaRutasOffline(): () => void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return () => {}
  const reloj = setTimeout(() => {
    // Los fallos se tragan a propósito: esto es una comodidad, no una función. Si no hay
    // red o el trozo no está, la pantalla seguirá bajándolo cuando toque.
    void import('../pages/FontDetailPage').catch(() => {})
    void import('../pages/RouteWaterPage').catch(() => {})
  }, ESPERA_MS)
  return () => clearTimeout(reloj)
}
