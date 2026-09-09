/**
 * Trocea un texto de usuario en lo que hay que pintar: texto llano, enlaces y menciones.
 *
 * Vive aparte de la interfaz porque es un **parser**, y un parser se prueba. Las reglas
 * de aquí deciden qué se convierte en un enlace pulsable dentro de algo que ha escrito
 * cualquiera, así que equivocarse tiene dos costes distintos: de menos, un enlace muerto;
 * de más, convertir en pulsable algo que no era una dirección.
 *
 * **No genera HTML en ningún momento.** Devuelve trozos y quien los pinta hace elementos
 * de React, así que no hay ningún camino por el que un texto de usuario acabe siendo
 * marcado. Es la misma razón por la que el popup del mapa escapa con `textContent`.
 */

export type Token =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'enlace'; href: string; etiqueta: string }
  | { tipo: 'mencion'; nombre: string }
  // Markdown ligero: **negrita** y *cursiva*. Llevan hijos porque dentro puede haber
  // enlaces o cursiva. NO se genera HTML en ningún punto —siguen siendo tokens que React
  // pinta como <strong>/<em>—, así que la propiedad de seguridad del parser se mantiene.
  | { tipo: 'fuerte'; hijos: Token[] }
  | { tipo: 'enfasis'; hijos: Token[] }

/** Un bloque de texto: un párrafo o una lista. Ver `parseBloques`. */
export type Bloque =
  | { tipo: 'parrafo'; hijos: Token[] }
  | { tipo: 'lista'; items: Token[][] }

/**
 * Reglas del nombre de usuario, para reconocer una mención dentro de un texto.
 *
 * **Tiene que decir lo mismo que `Mentions.isMentionable` en el servidor.** Si el cliente
 * subraya más de lo que el servidor avisa, se promete un aviso que no llega; si subraya
 * menos, hay avisos que nadie ve venir. Hay test de las dos mitades en el backend.
 *
 * Se para en 3 caracteres por abajo porque menos que eso son casi siempre falsos
 * positivos (una dirección de correo cortada, un `@` suelto), y en 30 por arriba porque
 * es lo que acepta el registro. El `(?<![\w@.])` evita lo importante: que dentro de
 * `hola@ejemplo.com` el `@ejemplo` se convierta en un enlace a un perfil inventado.
 */
const MENCION = /(?<![\w@.])@([a-zA-Z0-9_.-]{3,30})/g

/**
 * Direcciones web. Solo `http`, `https` y el `www.` suelto que la gente pega tal cual.
 *
 * Que el esquema esté en la expresión **es la defensa**: `javascript:` y `data:` no pueden
 * coincidir, así que no hay forma de que un texto de usuario se convierta en un enlace
 * ejecutable. No es una comprobación posterior que se pueda olvidar, es que no entra.
 *
 * El `(?<![\w@])` evita que el `www.x.com` de `hola@www.x.com` se coma media dirección de
 * correo.
 */
const ENLACE = /(?<![\w@])(?:https?:\/\/|www\.)[^\s<>"'`]+/gi

/** Signos que la gente pone DESPUÉS de pegar una dirección y no forman parte de ella. */
const PUNTUACION_FINAL = '.,;:!?»"\'…'

/**
 * Quita lo que se ha pegado detrás de la dirección sin ser parte de ella.
 *
 * Los paréntesis se cuentan en vez de recortarse a ciegas, y es justo el caso que motivó
 * todo esto: `es.wikipedia.org/wiki/Fuente_(arquitectura)` **termina** en un paréntesis
 * que sí es suyo, mientras que en `(mira https://ca.wikipedia.org/wiki/Font)` el último no
 * lo es. La diferencia es si está equilibrado dentro de la propia dirección.
 */
function recortaFinal(url: string): string {
  let out = url
  for (;;) {
    const ultimo = out.slice(-1)
    if (PUNTUACION_FINAL.includes(ultimo)) { out = out.slice(0, -1); continue }
    if (ultimo === ')' || ultimo === ']') {
      const abre = ultimo === ')' ? '(' : '['
      const nAbre = out.split(abre).length - 1
      const nCierra = out.split(ultimo).length - 1
      if (nCierra > nAbre) { out = out.slice(0, -1); continue }
    }
    break
  }
  return out
}

/** Cuánto se enseña de una dirección antes de recortarla. */
export const MAX_ETIQUETA = 48

/**
 * Cómo se lee un enlace en pantalla.
 *
 * Se quitan el esquema y el `www.` —ruido que todo el mundo sabe suplir— y se descodifican
 * los `%C3%A7` para que un topónimo catalán se lea. Al recortar **se conserva siempre el
 * dominio entero**: saber a dónde te lleva un enlace importa más que ver la ruta, y un
 * `…ikipedia.org/wiki/Font` no dice a dónde vas.
 */
export function etiquetaDe(href: string, max = MAX_ETIQUETA): string {
  let visible = href.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')
  try { visible = decodeURI(visible) } catch { /* mal codificada: se enseña tal cual */ }
  if (visible.length <= max) return visible
  const barra = visible.indexOf('/')
  const dominio = barra === -1 ? visible : visible.slice(0, barra)
  return dominio.length >= max - 1 ? dominio : visible.slice(0, max - 1) + '…'
}

/**
 * ## Markdown ligero, en cascada
 *
 * `**negrita**`, luego `*cursiva*`, luego el resto (enlaces y menciones, que ya estaban).
 * Cada nivel envuelve su marcador y delega lo de dentro y lo de entre al siguiente, así
 * la negrita puede contener cursiva y ambas un enlace, sin que un `*` de una URL rompa
 * nada: los enlaces se resuelven en el nivel más bajo, sobre texto ya sin marcadores.
 *
 * Cursiva exige que el contenido **no empiece ni acabe con espacio y no lleve `*`**, que
 * es lo que evita que `2 * 3` o un `**` residual se lea como cursiva. Un marcador sin
 * pareja (`a**b`) no casa y se queda como texto literal.
 */
const NEGRITA = /\*\*(\S(?:[^*]*?\S)?)\*\*/g
const CURSIVA = /\*([^*\s](?:[^*]*?[^*\s])?)\*/g

function envuelve(
  texto: string, regex: RegExp,
  wrap: (contenido: string) => Token, resto: (t: string) => Token[],
): Token[] {
  const out: Token[] = []
  let cursor = 0
  for (const m of texto.matchAll(regex)) {
    const i = m.index ?? 0
    if (i > cursor) out.push(...resto(texto.slice(cursor, i)))
    out.push(wrap(m[1]))
    cursor = i + m[0].length
  }
  if (cursor < texto.length) out.push(...resto(texto.slice(cursor)))
  return out
}

/**
 * Trocea una LÍNEA de texto en tokens inline (énfasis + enlaces + menciones).
 *
 * Las direcciones se buscan **primero** dentro de su nivel y las menciones solo en lo que
 * queda entre ellas: en `https://x.com/@alguien` ese `@alguien` no es una mención, y sin
 * este orden se partiría el enlace por la mitad.
 */
export function tokeniza(texto: string, { menciones = true }: { menciones?: boolean } = {}): Token[] {
  const cursiva = (t: string): Token[] =>
    envuelve(t, CURSIVA, (c) => ({ tipo: 'enfasis', hijos: enlacesYmenciones(c) }), enlacesYmenciones)
  return envuelve(texto, NEGRITA, (c) => ({ tipo: 'fuerte', hijos: cursiva(c) }), cursiva)

  function enlacesYmenciones(texto: string): Token[] {
  const salida: Token[] = []
  let cursor = 0

  const llano = (trozo: string) => {
    if (!trozo) return
    if (!menciones) { salida.push({ tipo: 'texto', texto: trozo }); return }
    let ultimo = 0
    for (const m of trozo.matchAll(MENCION)) {
      const i = m.index ?? 0
      if (i > ultimo) salida.push({ tipo: 'texto', texto: trozo.slice(ultimo, i) })
      salida.push({ tipo: 'mencion', nombre: m[1] })
      ultimo = i + m[0].length
    }
    if (ultimo < trozo.length) salida.push({ tipo: 'texto', texto: trozo.slice(ultimo) })
  }

  for (const m of texto.matchAll(ENLACE)) {
    const i = m.index ?? 0
    const bruto = recortaFinal(m[0])
    // Recortar puede dejarlo en nada aprovechable (`www.`, por ejemplo): entonces no era
    // un enlace y se devuelve al texto llano.
    if (!/^(?:https?:\/\/\S|www\.\S)/i.test(bruto) || bruto.length < 5) continue
    llano(texto.slice(cursor, i))
    const href = /^www\./i.test(bruto) ? `https://${bruto}` : bruto
    salida.push({ tipo: 'enlace', href, etiqueta: etiquetaDe(href) })
    cursor = i + bruto.length
  }
    llano(texto.slice(cursor))
    return salida
  }
}

/**
 * Divide un texto en bloques: párrafos y listas.
 *
 * Una línea que empieza por `- `, `* ` o `1. ` es un ítem de lista; las consecutivas se
 * agrupan. Una línea en blanco separa párrafos. Lo demás son párrafos, y dentro de uno
 * los saltos simples se conservan (el render los pinta con `pre-wrap`). El inline de cada
 * párrafo o ítem pasa por `tokeniza`, así que lleva negrita, cursiva, enlaces y menciones.
 *
 * Es para el texto largo (descripción, reseñas): una lista es un bloque y no cabe en el
 * render inline de `TextoRico`, que se usa también en una sola línea.
 */
const ITEM = /^[ \t]*(?:[-*]|\d+\.)[ \t]+(.*)$/

export function parseBloques(texto: string, opts: { menciones?: boolean } = {}): Bloque[] {
  const bloques: Bloque[] = []
  let parrafo: string[] = []
  let items: string[] = []
  const cierraParrafo = () => {
    if (parrafo.length) { bloques.push({ tipo: 'parrafo', hijos: tokeniza(parrafo.join('\n'), opts) }); parrafo = [] }
  }
  const cierraLista = () => {
    if (items.length) { bloques.push({ tipo: 'lista', items: items.map((it) => tokeniza(it, opts)) }); items = [] }
  }
  for (const linea of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const m = ITEM.exec(linea)
    if (m) { cierraParrafo(); items.push(m[1]) }
    else if (linea.trim() === '') { cierraParrafo(); cierraLista() }
    else { cierraLista(); parrafo.push(linea) }
  }
  cierraParrafo(); cierraLista()
  return bloques
}
