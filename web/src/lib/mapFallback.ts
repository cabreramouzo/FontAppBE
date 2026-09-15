/**
 * Qué fuentes deja el mapa cuando un refresco de `/fonts/map` FALLA (sin cobertura, 429,
 * 5xx…).
 *
 * La regla, y es la que faltaba: **un refresco fallido no puede vaciar el mapa.** Los
 * puntos que ya estaban en pantalla se cargaron con una petición que sí funcionó (o del
 * caché del service worker) y siguen siendo válidos; que la siguiente falle no los borra.
 *
 * Antes, sin zona guardada el `catch` ponía `[]` y **desaparecían todos los marcadores en
 * cuanto se iba la cobertura** — reportado en el campo: «se veían las fuentes y al perder
 * cobertura desaparecieron todos los puntos del caché, no tiene sentido». Con zona
 * guardada sí hay respaldo real; sin ella, se conserva lo que hubiera.
 *
 * @param previas  Las que ya se están pintando.
 * @param deZona   Las de la zona guardada, o `null` si no hay zona (no hay respaldo).
 */
export function fuentesTrasFalloDeRed<T>(previas: T[], deZona: T[] | null): T[] {
  return deZona ?? previas
}
