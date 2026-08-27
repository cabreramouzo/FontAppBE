/**
 * Distinguir «la app se ha actualizado» de «esta pantalla ha fallado».
 *
 * ## Qué pasa de verdad
 *
 * Las páginas se cargan en trozos (`lazy()`), y cada trozo lleva una huella en el nombre.
 * Al desplegar, esas huellas cambian. Una pestaña abierta desde antes sigue apuntando a
 * los nombres viejos, así que al navegar a otra página pide un fichero que ya no existe.
 *
 * Eso **no es un error de la pantalla**, es una versión caducada, y el arreglo es recargar.
 * Presentarlo como «esta pantalla ha fallado» le echa la culpa a la página que la persona
 * acaba de abrir y le ofrece justo lo que no toca.
 *
 * ## Cómo se reconoce
 *
 * No hay un tipo de error para esto: cada navegador lo dice a su manera. Se reconoce por
 * el texto, que es feo pero es lo que hay, y se cubren las tres formas conocidas —fallo de
 * red al importar, MIME incorrecto (el caso de Cloudflare devolviendo `index.html` con
 * 200) y el `vite:preloadError` del propio empaquetador—.
 *
 * ## Y se recarga UNA vez
 *
 * Con marca en `sessionStorage`, no en `localStorage`: si el fallo fuera de verdad
 * permanente, una marca que sobrevive a la pestaña dejaría a esa persona sin recargar
 * nunca más. Y sin marca de ningún tipo, un fallo permanente daría un bucle de recargas,
 * que es la peor pantalla posible: parpadea y no se puede ni leer el error.
 */

const MARCA = 'chunk:reloaded'

/**
 * Cuánto hay que esperar antes de volver a recargar por lo mismo.
 *
 * La primera versión permitía **una sola recarga por pestaña**, y eso era demasiado
 * estricto: quien deja la pestaña abierta un día entero pasa por varios despliegues, y a
 * partir del segundo se le enseñaba el error en vez de recargar. Le pasó al autor.
 *
 * Lo que hay que evitar es el **bucle** —recargar, fallar, recargar—, no recargar dos
 * veces con horas de diferencia. Treinta segundos separan las dos cosas: un bucle real
 * reaparece al instante, y un despliegue nuevo llega mucho después.
 */
const ESPERA_MS = 30_000

const SEÑALES = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'expected a javascript module script',
  'importing a module script failed',
  "unexpected token '<'",
]

/** Si este error es «la app se ha actualizado» y no un fallo de la pantalla. */
export function esTrozoCaducado(error: unknown): boolean {
  const texto = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error ?? '')
  const bajo = texto.toLowerCase()
  return SEÑALES.some((s) => bajo.includes(s))
}

/**
 * Recarga si el error es un trozo caducado y aún no se ha recargado en esta pestaña.
 *
 * Devuelve `true` si va a recargar, para que quien llame sepa que no tiene que pintar nada.
 */
export function recargaSiEsTrozoCaducado(
  error: unknown,
  ahora: number = Date.now(),
  // `globalThis` y no `window`: este módulo lo carga también `node --test`, donde
  // `window` no existe y el tipo ni siquiera compila.
  recargar: () => void = () => { (globalThis as { location?: { reload(): void } }).location?.reload() },
): boolean {
  if (!esTrozoCaducado(error)) return false
  try {
    const ultima = Number(sessionStorage.getItem(MARCA) ?? 0)
    if (Number.isFinite(ultima) && ahora - ultima < ESPERA_MS) return false
    sessionStorage.setItem(MARCA, String(ahora))
  } catch {
    // Sin almacenamiento no se puede evitar el bucle, así que no se recarga: mejor un
    // mensaje raro una vez que una pantalla parpadeando para siempre.
    return false
  }
  recargar()
  return true
}

/**
 * ¿Este fallo de carga es por falta de red y no por un despliegue nuevo?
 *
 * Los dos producen **el mismo error** —«failed to fetch dynamically imported module»—
 * porque en los dos casos el fichero no llega. Distinguirlos importa porque la salida es
 * la contraria: con un despliegue nuevo hay que recargar, y sin cobertura recargar es lo
 * peor que puedes hacer, porque te quedas sin ni siquiera lo que tenías en pantalla.
 *
 * Se mira `navigator.onLine`, que miente en un sentido inofensivo: puede decir «sí» con
 * una wifi sin salida, y entonces se trata como despliegue —que es lo de antes—. Lo que
 * no hace nunca es decir «no» teniendo red, que es el caso que aquí hay que acertar.
 */
export function esFalloPorFaltaDeRed(error: unknown): boolean {
  if (!esTrozoCaducado(error)) return false
  // Sin los tipos del DOM: este módulo lo cargan los tests con el runner de Node, y basta
  // un `navigator` tipado para que deje de compilar allí. Misma pega que ya obligó a
  // partir `zonaOffline`, y aquí se resuelve como el `location.reload` de más arriba.
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator
  return nav?.onLine === false
}
