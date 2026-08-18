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
 * Trocea el texto. Las direcciones se buscan **primero** y las menciones solo en lo que
 * queda entre ellas: en `https://x.com/@alguien` ese `@alguien` no es una mención, y sin
 * este orden se partiría el enlace por la mitad.
 */
export function tokeniza(texto: string, { menciones = true }: { menciones?: boolean } = {}): Token[] {
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
