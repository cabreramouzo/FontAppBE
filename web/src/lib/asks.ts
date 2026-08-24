import { useEffect, useSyncExternalStore } from 'react'

/**
 * Cola de interrupciones: **como mucho una a la vez**.
 *
 * ## El problema que resuelve, medido en producción
 *
 * Cada aviso se escribió por separado y ninguno sabía de los otros, así que en una
 * primera visita se apilaban tres dentro de los primeros seis segundos: la presentación
 * («¿qué es FontApp?»), el «añádela a la pantalla de inicio» a los 3 s y la encuesta de
 * la app nativa a los 6 s. En un móvil de 393 px, la encuesta **tapaba el segundo botón
 * de la presentación** — «o crea una cuenta para contribuir», que es justamente la
 * llamada a la acción que justifica todo lo demás.
 *
 * Y pasa en el peor sitio posible: es lo que ve quien acaba de escanear el QR de un
 * cartel.
 *
 * ## Cómo funciona
 *
 * Cada aviso declara que **está listo** y con qué prioridad; solo el más prioritario de
 * los que están listos se pinta. Al cerrarse deja de estar listo y le toca al siguiente.
 * No hay ningún componente que sepa de los demás, así que añadir un aviso nuevo mañana
 * es apuntarlo en `PRIORIDAD` y no vuelve a haber solapes por descuido.
 *
 * El estado vive en un módulo y no en un contexto a propósito: son cinco componentes en
 * dos árboles distintos (`App` y `Layout`) y un proveedor tendría que envolverlos a los
 * dos para no aportar nada más.
 */

/**
 * Quién va antes. Menor número, más prioridad, y el orden **no es por urgencia técnica
 * sino por lo que cada aviso se ha ganado el derecho a interrumpir**:
 *
 * - `intro` y `welcome` explican qué es esto. Sin ellos lo demás no se entiende.
 * - `badge` es un premio por algo que la persona acaba de hacer; nada debe taparlo.
 * - `onboarding` espera a que la acción esté en pantalla y enseña sin interrumpir a lo anterior.
 * - `install` y `interest` piden un favor. Van los últimos porque son los únicos que la
 *   persona no ha pedido de ninguna manera.
 */
const PRIORIDAD = {
  intro: 0,
  welcome: 0,
  badge: 1,
  onboarding: 2,
  install: 3,
  interest: 4,
} as const

export type Aviso = keyof typeof PRIORIDAD

const listos = new Set<Aviso>()
const oyentes = new Set<() => void>()
let turno: Aviso | null = null

function recalcula() {
  let mejor: Aviso | null = null
  for (const a of listos) if (mejor === null || PRIORIDAD[a] < PRIORIDAD[mejor]) mejor = a
  turno = mejor
}

function suscribe(f: () => void) {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

/**
 * ¿Le toca a este aviso?
 *
 * `listo` es «tengo algo que decir», no «pínteme»: el componente calcula sus propias
 * condiciones (ya lo cerró, ya está instalada, aún no toca…) y esto solo decide el turno.
 */
export function useTurno(quien: Aviso, listo: boolean): boolean {
  useEffect(() => {
    if (!listo) return
    listos.add(quien)
    recalcula()
    for (const f of oyentes) f()
    return () => {
      listos.delete(quien)
      recalcula()
      for (const f of oyentes) f()
    }
  }, [quien, listo])

  const actual = useSyncExternalStore(suscribe, () => turno, () => null)
  return listo && actual === quien
}

// MARK: - Cuántas veces ha vuelto

const SESIONES = 'asks:sessions'
const ESTA = 'asks:thisSession'

/**
 * Cuántas veces se ha abierto la app en este navegador, contando ésta.
 *
 * Sirve para lo único que importa aquí: **no pedirle favores a quien acaba de llegar**.
 * Instalar en la pantalla de inicio algo que has visto una vez no lo hace nadie, y
 * preguntarle a un desconocido si querría una app nativa es pedirle una opinión que
 * todavía no puede tener — mientras le gastas el único momento en que te prestaba
 * atención.
 *
 * Una «sesión» es una pestaña abierta de nuevo (`sessionStorage`), no un día: quien deja
 * la app abierta toda la tarde no suma. Es idempotente, así que se puede llamar desde
 * donde sea las veces que sea.
 *
 * Sin almacenamiento (modo privado) devuelve 1, o sea «acaba de llegar»: ante la duda,
 * no molestar.
 */
export function sesiones(): number {
  try {
    if (!sessionStorage.getItem(ESTA)) {
      sessionStorage.setItem(ESTA, '1')
      const n = Number(localStorage.getItem(SESIONES) || 0)
      localStorage.setItem(SESIONES, String((Number.isFinite(n) ? n : 0) + 1))
    }
    return Number(localStorage.getItem(SESIONES) || 1) || 1
  } catch {
    return 1
  }
}
