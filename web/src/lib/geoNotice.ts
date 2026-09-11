/**
 * Distinguir «permiso caducado» de «permiso bloqueado» al pedir la ubicación.
 *
 * `getCurrentPosition` devuelve el MISMO `PERMISSION_DENIED` en dos casos muy distintos:
 *  · en iOS el permiso caduca cada 24 h y vuelve a 'prompt'; al tocar ubicar se vuelve a
 *    preguntar, y si lo cierras es un «ahora no» — basta tocar otra vez. NO es un bloqueo.
 *  · o lo has bloqueado de verdad para el sitio: ahí no se vuelve a preguntar y hay que ir
 *    a los ajustes del navegador.
 * Decir «bloqueado» en el primer caso asusta sin motivo; no decir cómo desbloquear en el
 * segundo deja al usuario atascado. Lo resolvemos mirando `navigator.permissions`.
 */
export type EstadoPermiso = 'granted' | 'prompt' | 'denied' | null

/**
 * ¿Está la ubicación bloqueada de verdad (hay que ir a ajustes), o solo caducada / sin
 * pedir (basta reintentar)? Ante la duda (`null`: navegador sin `permissions`, iOS viejo)
 * se asume que NO — mejor invitar a reintentar que decirle «bloqueado» a quien no lo está.
 */
export function ubicacionBloqueada(estado: EstadoPermiso): boolean {
  return estado === 'denied'
}

/** Clave de i18n del aviso tras un `PERMISSION_DENIED`, según el estado del permiso. */
export function claveAvisoTrasDenegar(estado: EstadoPermiso): 'map.geoBlocked' | 'map.geoDismissed' {
  return ubicacionBloqueada(estado) ? 'map.geoBlocked' : 'map.geoDismissed'
}
