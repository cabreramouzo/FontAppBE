import { getMyBadgesPreview } from '../api/client'
import type { PublicBadge, PublicGamification } from '../api/client'

/**
 * Detectar que acabas de ganar una insignia, para poder celebrarlo.
 *
 * ## Cuándo pasa de verdad
 *
 * No en el momento de reseñar. Las insignias se cuentan **solo con aportaciones
 * liquidadas**, y una aportación tarda 72 h en liquidarse por si hay que anularla. Antes
 * de eso la insignia no está ganada: celebrarla y quitarla después sería peor que no
 * celebrar nada. Así que el momento real es **la primera vez que la app ve una insignia
 * que antes no tenías**, que en la práctica es tu siguiente visita pasados esos tres
 * días. Sigue siendo una sorpresa; solo que no es inmediata, y no puede serlo.
 *
 * ## Cómo se sabe
 *
 * Guardando en el navegador la lista de lo que ya se había visto y comparándola. Sin
 * estado en el servidor: una columna de «insignias ya enseñadas» sería una escritura por
 * usuario para algo que solo importa en el dispositivo donde se mira.
 *
 * Consecuencia asumida: cambiar de móvil o borrar los datos del navegador celebra otra
 * vez, y por eso **la primera vez no celebra nada** — se guarda la foto de lo que hay y
 * se calla. Sin esa regla, quien ya tiene ocho insignias se comería ocho fiestas seguidas
 * el día que esto se despliegue.
 */
const CLAVE = 'badges:seen'

/** El nivel que ya se había visto, para celebrar el ascenso. */
const CLAVE_NIVEL = 'level:seen'

/** Ya se ha mirado en esta sesión del navegador (no persiste entre visitas). */
const YA_MIRADO = 'badges:checked'

/** `familia:grado`, para que subir de bronce a plata también cuente como novedad. */
function marca(b: PublicBadge): string {
  return `${b.family}:${b.tier}`
}

function leerVistas(): string[] | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (crudo == null) return null
    const v = JSON.parse(crudo)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null
  } catch {
    // Safari en privado lanza al tocar localStorage. Sin memoria no hay celebración,
    // que es mejor que romper el arranque de la aplicación.
    return null
  }
}

function leerNivel(): string | null {
  try {
    return localStorage.getItem(CLAVE_NIVEL)
  } catch {
    return null
  }
}

function guardarNivel(nivel: string | null) {
  try {
    if (nivel) localStorage.setItem(CLAVE_NIVEL, nivel)
    else localStorage.removeItem(CLAVE_NIVEL)
  } catch {
    // igual que arriba
  }
}

function guardarVistas(marcas: string[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(marcas))
  } catch {
    // igual que arriba
  }
}

/**
 * ¿Merece la pena pedir nada ahora mismo?
 *
 * Esto es una floritura, y una floritura no gasta los datos de nadie. Se salta sin
 * conexión, con el ahorro de datos puesto y en redes lentas (2g), que es lo que pidió el
 * encargo con «si hay buena conexión».
 */
export function buenaConexion(): boolean {
  if (typeof navigator === 'undefined') return false
  if (navigator.onLine === false) return false
  const c = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (!c) return true
  if (c.saveData) return false
  return c.effectiveType !== 'slow-2g' && c.effectiveType !== '2g'
}

export interface Novedad {
  /** La insignia nueva, o `null` si lo que hay es un ascenso de nivel. */
  badge: PublicBadge | null
  /** Clave del nivel al que se acaba de subir, si es eso lo que ha pasado. */
  level: string | null
  /** Cuántas insignias más han aparecido a la vez, sin contar la que se enseña. */
  otras: number
}

/**
 * Mira si hay insignias nuevas para el usuario y devuelve la que hay que celebrar.
 *
 * Si aparecen varias de golpe se enseña **una sola** y se dice cuántas más hay: encadenar
 * cuatro diálogos convierte un premio en un trámite. Las demás están en la vitrina.
 *
 * Marca todas como vistas aunque solo se enseñe una, a propósito — la fiesta es por
 * haberlas ganado, no una cola pendiente de reproducir.
 */
export async function buscarNovedades(forzar = false): Promise<Novedad | null> {
  if (!buenaConexion()) return null
  // Una vez por sesión del navegador, salvo que acabemos de aportar. Sin esto, cada
  // recarga de la página pide la lista otra vez.
  if (!forzar) {
    try {
      if (sessionStorage.getItem(YA_MIRADO)) return null
      sessionStorage.setItem(YA_MIRADO, '1')
    } catch {
      // Sin sessionStorage se mira igual: es una petición barata, no un desastre.
    }
  }

  let datos: PublicGamification
  try {
    datos = await getMyBadgesPreview()
  } catch {
    return null
  }

  const { badges, level } = datos
  const marcas = badges.map(marca)
  const vistas = leerVistas()
  const nivelVisto = leerNivel()

  if (vistas == null) {
    // Primera vez en este navegador: se guarda todo y no se celebra nada.
    guardarVistas(marcas)
    guardarNivel(level)
    return null
  }

  const conocidas = new Set(vistas)
  const nuevas = badges.filter((b) => !conocidas.has(marca(b)))
  guardarVistas(marcas)

  // El ascenso va primero: subir de peldaño es más grande que una insignia más, y si
  // coinciden —lo normal, porque las dos salen de la misma aportación— es lo que apetece
  // ver. La insignia se queda contada en «y N más».
  const subida = level != null && level !== nivelVisto && nivelVisto != null
  guardarNivel(level)
  if (subida) return { badge: null, level, otras: nuevas.length }

  if (nuevas.length === 0) return null

  // La de grado más alto primero: si en la misma tanda cae un oro y un bronce, el que
  // apetece ver en grande es el oro.
  const orden = ['bronze', 'silver', 'gold', 'unique']
  nuevas.sort((a, b) => orden.indexOf(b.tier) - orden.indexOf(a.tier))
  return { badge: nuevas[0], level: null, otras: nuevas.length - 1 }
}

/**
 * La comprobación de después de aportar, que es la que da sentido a todo esto.
 *
 * Sondea unas cuantas veces porque el evento no existe en el instante del POST: la
 * gamificación va por detrás de la petición (middleware de modelo, unos segundos más
 * tarde), a propósito, para que aportar no cueste ni un milisegundo más. Se pregunta a los
 * 2, 6 y 14 segundos y se deja de insistir: si a los quince no está, es que no había
 * insignia que dar, y una cuarta pregunta solo gasta batería.
 *
 * Se salta el candado de «una vez por sesión»: aquí sabemos que algo ha cambiado.
 */
export async function buscarNovedadesTrasAportar(): Promise<Novedad | null> {
  for (const espera of [2000, 4000, 8000]) {
    await new Promise((r) => setTimeout(r, espera))
    const n = await buscarNovedades(true)
    if (n) return n
  }
  return null
}
