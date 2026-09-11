/**
 * Rutas donde NO salta ninguna interrupción de la cola de `lib/asks` (tutorial de
 * bienvenida, tarjeta de la primera fuente con su petición de ubicación, «instala la app»,
 * encuesta, novedades…).
 *
 * `/install` es un enlace de ayuda: se comparte con alguien que solo quiere instalar la
 * app —a menudo porque te lo ha pedido—, y encontrarse el tutorial y una petición de
 * ubicación encima estorba justo cuando pediste ayuda para lo contrario. Igual
 * `/support` y `/legal`: son páginas informativas que se abren a propósito, no el mapa
 * donde el onboarding tiene sentido. Lista y no un booleano para que añadir otra sea una línea.
 */
export const RUTAS_SIN_INTERRUPCIONES = ['/install', '/support', '/legal']

export function permiteInterrupciones(pathname: string): boolean {
  return !RUTAS_SIN_INTERRUPCIONES.includes(pathname)
}
