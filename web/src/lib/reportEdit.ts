/**
 * ¿Se puede corregir todavía este comentario?
 *
 * La ventana es de una hora, y es una ventana y no «siempre» por lo que un comentario
 * significa aquí: otras personas lo leen para decidir si se desvían, y algunos llevan
 * respuesta debajo. Poder reescribirlo a los tres días deja conversaciones que no se
 * entienden. Una hora cubre lo que de verdad se pide —la errata, el «quería decir la otra
 * fuente», el dedo en el móvil— sin abrir eso.
 *
 * **Quien manda es el servidor**, que responde 403 `report.editWindowOver` pasada la hora
 * (`FontReportController.editWindow`). Esto solo decide si se pinta el botón: ofrecer una
 * acción que solo sabe dar error es justo lo que esta app no hace.
 */
export const VENTANA_EDICION_MS = 60 * 60 * 1000

export interface ComentarioEditable {
  userID?: string | null
  createdAt?: string | null
}

export function puedeEditar(
  r: ComentarioEditable,
  yo: string | null | undefined,
  ahora = Date.now(),
): boolean {
  if (!yo || !r.userID || r.userID !== yo) return false
  if (!r.createdAt) return false
  const t = new Date(r.createdAt).getTime()
  if (!Number.isFinite(t)) return false
  // Una fecha en el futuro —reloj del móvil adelantado— no abre una ventana eterna.
  const transcurrido = ahora - t
  return transcurrido >= 0 && transcurrido <= VENTANA_EDICION_MS
}
