/**
 * Agrupa comentarios y sus respuestas para pintarlos.
 *
 * El servidor devuelve la lista **plana** —comentarios y respuestas mezclados— y aquí se
 * arma el hilo. Se hace en el cliente y no en el servidor porque el orden de cada nivel es
 * distinto y es una decisión de lectura, no de datos:
 *
 * - Los comentarios van **del más nuevo al más viejo**, como estaban: lo último que se ha
 *   dicho sobre la fuente es lo que interesa primero.
 * - Las respuestas de cada uno, **del más viejo al más nuevo**: una conversación se lee en
 *   el orden en que ocurrió.
 *
 * Una respuesta cuyo padre no está en la lista se trata como comentario suelto en vez de
 * desaparecer. Pasa de verdad: al borrar un comentario, sus respuestas se quedan sin padre
 * a propósito —son palabras de otra persona y no se borran con las tuyas— y sin esto se
 * volverían invisibles sin que nadie las hubiera quitado.
 */
export interface ConHilo {
  id: string
  parentID?: string | null
  createdAt: string
}

export interface Hilo<T> {
  comentario: T
  respuestas: T[]
}

export function agrupaEnHilos<T extends ConHilo>(items: T[]): Hilo<T>[] {
  const porID = new Set(items.map((i) => i.id))
  const esRaiz = (i: T) => !i.parentID || !porID.has(i.parentID)

  const raices = items.filter(esRaiz)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const hijas = new Map<string, T[]>()
  for (const i of items) {
    if (esRaiz(i)) continue
    const lista = hijas.get(i.parentID!) ?? []
    lista.push(i)
    hijas.set(i.parentID!, lista)
  }
  return raices.map((comentario) => ({
    comentario,
    respuestas: (hijas.get(comentario.id) ?? [])
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  }))
}
