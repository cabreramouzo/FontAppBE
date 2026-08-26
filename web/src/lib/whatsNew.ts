/**
 * Qué es **nuevo para ti**, y no qué es nuevo en el calendario.
 *
 * ## La trampa que esto evita
 *
 * Lo natural es enseñar un «NUEVO» durante una semana desde que se publica algo. Y mide el
 * tiempo equivocado: el del *release*, no el de la persona.
 *
 * - Quien **instala hoy** vería «NUEVO» sobre tres cosas cuando para él la app **entera**
 *   es nueva. Es ruido, y encima le señala lo accesorio antes que lo básico.
 * - Quien **lleva seis meses** usándola y vuelve al octavo día no ve nada, y es justo la
 *   persona a la que había que avisar.
 *
 * Aquí se guarda **qué versión de novedades has visto**. Algo es nuevo para ti mientras tu
 * marca sea anterior a la versión que lo introdujo. Se apaga solo, no envejece, y a quien
 * acaba de llegar no le sale nunca.
 *
 * Precio asumido: quien borre los datos del navegador lo verá una vez más. Barato.
 *
 * ## Cómo se añade una novedad
 *
 * Se sube `VERSION_NOVEDADES` y se apunta la clave en `NOVEDADES` con esa versión. Lo que
 * quiera llevar distintivo llama a `esNuevoParaTi('clave')`.
 */

const CLAVE = (scope: string) => `news:seen:v1:${scope}`

/**
 * Cuántas visitas **tuyas** siguen llevando distintivo después de leer las novedades.
 *
 * El diálogo te **cuenta** lo que hay; los distintivos te ayudan a **encontrarlo** las
 * siguientes veces que entras. Por eso no se apagan a la vez que el diálogo: si lo
 * hicieran no los vería nadie —quedan detrás de un modal y se apagarían en el mismo gesto
 * que lo cierra— y el aviso se quedaría en «hay una flecha nueva» sin decir dónde.
 *
 * Se cuenta en **sesiones tuyas** y no en días, que es la idea de todo este módulo: quien
 * abre la app una vez al mes tiene tres aperturas para verlos, no tres días.
 */
export const SESIONES_CON_DISTINTIVO = 3

/**
 * Versión actual de las novedades. **Se sube al añadir algo que merezca contarse**, no en
 * cada despliegue: si se subiera siempre, el aviso saldría por un arreglo de un margen y
 * dejaría de creerse.
 */
export const VERSION_NOVEDADES = 1

/** Qué se estrenó en cada versión. La clave la usan los distintivos «nuevo». */
export const NOVEDADES: Record<string, number> = {
  approach: 1,   // la flecha de los últimos metros
  gpx: 1,        // descargar fuentes y «agua en mi ruta»
  history: 1,    // historial de búsquedas
}

/**
 * La versión que esta persona ya ha visto, o `null` si **nunca ha visto ninguna**.
 *
 * `null` no es lo mismo que `0`, y de esa diferencia depende todo: significa «no sabemos
 * si es alguien nuevo o alguien que ya estaba», y quien decide es {@link debeVerNovedades}.
 */
interface Marca {
  /** Versión de novedades que ya ha leído. */
  v: number
  /** Hasta qué sesión suya siguen saliendo los distintivos. */
  hasta: number
}

/**
 * La marca de esta persona, o `null` si **nunca ha visto ninguna**.
 *
 * `null` no es lo mismo que la versión 0, y de esa diferencia depende todo: significa «no
 * sabemos si acaba de llegar o si ya estaba», y quien decide es {@link debeVerNovedades}.
 */
export function marcaDe(scope: string): Marca | null {
  try {
    const crudo = localStorage.getItem(CLAVE(scope))
    if (crudo === null) return null
    const m = JSON.parse(crudo) as Partial<Marca>
    if (!Number.isFinite(m?.v)) return null
    return { v: m.v as number, hasta: Number.isFinite(m?.hasta) ? (m.hasta as number) : 0 }
  } catch {
    return null
  }
}

export function marcaNovedadesVistas(
  scope: string,
  sesionActual: number,
  version = VERSION_NOVEDADES,
): void {
  const marca: Marca = { v: version, hasta: sesionActual + SESIONES_CON_DISTINTIVO }
  try { localStorage.setItem(CLAVE(scope), JSON.stringify(marca)) } catch { /* modo privado */ }
}

/**
 * ¿Se le enseña el aviso de novedades?
 *
 * Solo a quien **ya usaba la app antes** del cambio. Hay que distinguir dos formas de no
 * tener marca:
 *
 * - **Recién llegado** (`yaUsabaLaApp` falso): no. Tiene el diálogo de bienvenida, y
 *   contarle «novedades» de algo que nunca ha tenido es ruido puro.
 * - **Ya estaba** pero sin marca, porque esto no existía cuando empezó: sí. Es exactamente
 *   la persona a la que hay que avisar, y sin este caso el aviso no se lo comería nadie
 *   la primera vez que se publica.
 */
export function debeVerNovedades(scope: string, yaUsabaLaApp: boolean): boolean {
  const marca = marcaDe(scope)
  if (marca === null) return yaUsabaLaApp
  return marca.v < VERSION_NOVEDADES
}

/**
 * ¿Este trozo de la app es nuevo **para esta persona**?
 *
 * Sale **después** de leer las novedades y durante {@link SESIONES_CON_DISTINTIVO} visitas
 * suyas. Ese orden no es un detalle: la primera versión los encendía *antes* de leerlas y
 * los apagaba al cerrar el diálogo, así que **no los veía nadie** — quedaban detrás del
 * modal y se apagaban en el mismo gesto que lo cerraba. Se descubrió probándolo: el
 * diálogo salía perfecto y el distintivo no aparecía jamás.
 *
 * Repartidos así, las dos piezas se complementan en vez de solaparse: el diálogo **cuenta**
 * qué hay de nuevo y los distintivos **enseñan dónde está** las siguientes veces que entras.
 *
 * Sin marca devuelve `false`: quien llega hoy no lleva nada marcado como nuevo, porque
 * para él lo es todo. Igual con una clave desconocida — un distintivo que sobrevive al
 * borrado de su novedad se quedaría puesto para siempre.
 */
export function esNuevoParaTi(clave: string, scope: string, sesionActual: number): boolean {
  const desde = NOVEDADES[clave]
  if (desde === undefined) return false
  const marca = marcaDe(scope)
  if (marca === null) return false
  return marca.v >= desde && sesionActual <= marca.hasta
}
