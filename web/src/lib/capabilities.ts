import { getGamification } from '../api/client'

/**
 * Qué abre tu nivel. Fase 6 (docs/gamificacion.md).
 *
 * Se pide **una vez por sesión** y se comparte: la ficha de cada fuente necesita saber si
 * puedes mover el pin, y con una petición por ficha abierta serían decenas por paseo para
 * una respuesta que no cambia mientras navegas.
 *
 * Esto es solo para la interfaz. **Quien decide es el servidor**: si aquí dijéramos que sí
 * y allí que no, el usuario vería el mapa y se comería un 403 al guardar; y al revés, un
 * cliente manipulado no se salta nada, porque `FontController` lo vuelve a comprobar.
 */
export type Capability = 'relocateAnyFont'

let cache: Promise<Capability[]> | null = null

export function capabilities(): Promise<Capability[]> {
  if (!cache) {
    cache = getGamification()
      // 204 (gamificación apagada) llega como undefined: no es un fallo, es que no hay
      // nada que conceder.
      .then((p) => (p?.grant?.capabilities ?? []) as Capability[])
      .catch(() => [])
  }
  return cache
}

/** Al entrar o salir de una cuenta lo de antes ya no vale. */
export function forgetCapabilities() {
  cache = null
}
