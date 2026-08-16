/**
 * El zumbido del icono de Novedades: enseñar que la sección existe, una vez, y callarse.
 *
 * El problema es real y medido en la propia app: la gente entra al mapa, busca su fuente
 * y se va. Novedades está a un icono de distancia y mucha gente no llega a saber que está
 * ahí. Un movimiento pequeño en el sitio correcto lo resuelve mejor que un cartel.
 *
 * Lo que **no** hace, y es la mitad del diseño:
 *
 * - **No zumba a quien ya ha entrado.** En cuanto se visita `/activity` una vez, esto se
 *   apaga para siempre en ese navegador. Ya ha cumplido; seguir insistiendo sería pedir
 *   atención sin tener nada que decir.
 * - **No zumba indefinidamente a quien lo ignora.** Hay un tope total (`MAX_TOTAL`). Si
 *   alguien ha visto el gesto seis veces y no ha picado, no está interesado, y un icono
 *   que se mueve solo cada día deja de leerse como un aviso y pasa a leerse como una
 *   avería de la interfaz.
 * - **No zumba más de una vez al día.** Aunque se abra y cierre la app diez veces.
 * - **No se mueve si el sistema pide menos movimiento** (`prefers-reduced-motion`). Ahí
 *   la animación no es un adorno prescindible: para quien tiene trastornos vestibulares
 *   es la diferencia entre poder usar la app o no.
 *
 * Todo el estado vive en `localStorage` y por navegador, no en el servidor: es una
 * ayuda de descubrimiento, no un dato del usuario, y no vale el coste de una tabla ni de
 * sincronizarlo entre dispositivos. El precio de equivocarse es que alguien que estrena
 * móvil vea el gesto otra vez.
 */

const VISITADO = 'news:visited'
const CUENTA = 'news:nudges'
const ULTIMO = 'news:lastNudgeDay'

/** Cuántos zumbidos en total antes de rendirse, sumando todos los días. */
const MAX_TOTAL = 6

/**
 * Cuándo zumba, en milisegundos desde que se abre el mapa. Tres veces repartidas en diez
 * minutos, como pediste.
 *
 * El primero a los 40 s y no de inmediato: al abrir la app la gente está mirando dónde
 * está y qué fuentes tiene cerca, y un icono moviéndose en la esquina en ese momento se
 * pierde entre el mapa cargando y la posición centrándose. Cuarenta segundos es tiempo
 * de haber hecho lo que venías a hacer.
 */
const MOMENTOS = [40_000, 4 * 60_000, 9 * 60_000]

function leerInt(clave: string): number {
  const v = Number(localStorage.getItem(clave))
  return Number.isFinite(v) ? v : 0
}

/** Día local en `AAAA-MM-DD`, para el tope de uno al día. */
function hoy(now = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

/** Se ha entrado a Novedades: no hace falta insistir más. */
export function marcarNovedadesVistas(): void {
  try {
    localStorage.setItem(VISITADO, '1')
  } catch {
    // Modo privado de Safari y similares: sin `localStorage` no hay memoria, así que
    // el peor caso es que el gesto se repita. No es motivo para romper la navegación.
  }
}

/** Si hoy, en este navegador, todavía toca zumbar. */
export function debeZumbar(): boolean {
  try {
    if (localStorage.getItem(VISITADO)) return false
    if (leerInt(CUENTA) >= MAX_TOTAL) return false
    if (localStorage.getItem(ULTIMO) === hoy()) return false
    return true
  } catch {
    return false
  }
}

/** Deja constancia de un zumbido: cuenta para el tope total y ocupa el día. */
export function anotarZumbido(): void {
  try {
    localStorage.setItem(CUENTA, String(leerInt(CUENTA) + 1))
    localStorage.setItem(ULTIMO, hoy())
  } catch {
    // Ver `marcarNovedadesVistas`.
  }
}

/**
 * Programa los zumbidos de esta sesión y devuelve cómo cancelarlos.
 *
 * El día se ocupa con el **primer** zumbido, no con los tres: si alguien cierra la app a
 * los dos minutos, los otros dos no llegan a ocurrir y no deben contar contra el tope.
 */
export function programarZumbidos(zumbar: () => void): () => void {
  if (!debeZumbar()) return () => {}
  const timers = MOMENTOS.map((ms) =>
    window.setTimeout(() => {
      zumbar()
      anotarZumbido()
    }, ms),
  )
  return () => timers.forEach(window.clearTimeout)
}

export const _test = { MOMENTOS, MAX_TOTAL, hoy }
