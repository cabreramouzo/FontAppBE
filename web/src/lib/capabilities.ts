import { getGamification, getGamificationScale } from '../api/client'

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
export type Capability =
  | 'addSecondaryPhoto'
  | 'resolveIncident'
  | 'relocateAnyFont'

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

/**
 * A partir de qué nivel se abre cada capacidad, **según el servidor**.
 *
 * Existe para que los avisos puedan decir «necesitas el nivel Arroyo» en vez de «todavía
 * no puedes». Un «no puedes» sin más deja a la persona sin saber si le faltan diez gotas
 * o diez mil, y sin nada que hacer al respecto.
 *
 * Las cifras **no se escriben aquí**: vienen de `/gamification/scale`, que es pública y
 * no toca la base de datos. Es la regla de siempre en esta parte de la app — el baremo se
 * ha recalibrado varias veces, y un aviso que promete un nivel equivocado es peor que uno
 * genérico. Se pide una vez y se comparte con toda la sesión.
 */
let escala: ReturnType<typeof getGamificationScale> | null = null

function scale() {
  if (!escala) escala = getGamificationScale()
  return escala
}

export function capabilityLevels(): Promise<{ key: string; level: string; gotes: number }[]> {
  return scale().then((e) => e.capabilities ?? []).catch(() => [])
}

/**
 * ¿Los niveles conceden permisos hoy, o son solo un rótulo?
 *
 * Hace falta para no prometer ni amenazar con permisos que no existen: el sistema nace
 * apagado (`GAMIFICATION_CAPABILITIES`) y el aviso de «al ocultar tu nivel dejas de
 * recibir los permisos» sería falso en una instalación donde nunca se han concedido.
 */
export function capabilitiesEnabled(): Promise<boolean> {
  return scale().then((e) => e.capabilitiesEnabled === true).catch(() => false)
}
