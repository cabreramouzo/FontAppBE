/**
 * Detectar la `@mención` que se está escribiendo, para sugerirla.
 *
 * La regla **tiene que ser la misma** que la del parser que pinta los enlaces
 * (`MENCION` en `richText.ts`) y la del servidor (`Mentions.names(in:)`). Si se separan,
 * se sugiere un nombre que después ni se subraya ni avisa — que es exactamente el fallo
 * que la paridad cliente/servidor existe para impedir.
 *
 * De ahí el `(?<![\w@.])`: sin él, escribir un correo (`hola@fontapp.net`) abriría la
 * lista de sugerencias a media dirección.
 *
 * Va en un módulo aparte y no dentro del componente porque es lo único con casos límite,
 * y son los que se rompen en silencio: el `@` de un correo, el cursor a mitad de palabra,
 * dos menciones en la misma frase.
 */
const EN_CURSO = /(?<![\w@.])@([a-zA-Z0-9_.-]{0,30})$/

export interface MencionEnCurso {
  /** Índice de la `@`. */
  desde: number
  /** Índice del final de lo escrito (el cursor). */
  hasta: number
  /** Lo tecleado tras la `@`, sin ella. */
  prefijo: string
}

/**
 * La mención que se está escribiendo justo antes del cursor, o `null`.
 *
 * Solo mira **lo que hay a la izquierda del cursor**: escribir en medio de una palabra ya
 * escrita no debe abrir nada, y lo que venga después no cambia lo que estás tecleando.
 */
export function mencionEnCurso(texto: string, caret: number): MencionEnCurso | null {
  const izquierda = texto.slice(0, caret)
  const m = EN_CURSO.exec(izquierda)
  if (!m) return null
  // Si a la derecha del cursor sigue una letra, estás editando dentro de una palabra ya
  // escrita: sugerir ahí reemplazaría texto que no se está tocando.
  if (/[a-zA-Z0-9_.-]/.test(texto.charAt(caret))) return null
  return { desde: caret - m[0].length, hasta: caret, prefijo: m[1] }
}

/** Sustituye la mención en curso por el nombre elegido y devuelve dónde queda el cursor. */
export function insertaMencion(
  texto: string, m: MencionEnCurso, username: string,
): { texto: string; caret: number } {
  // El espacio final no es cosmético: sin él, el cursor queda pegado al nombre y la
  // siguiente letra lo alarga, así que la mención recién elegida deja de existir.
  const trozo = `@${username} `
  return {
    texto: texto.slice(0, m.desde) + trozo + texto.slice(m.hasta),
    caret: m.desde + trozo.length,
  }
}
