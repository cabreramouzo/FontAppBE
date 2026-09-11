/**
 * ¿Puedo volver a decir «sigue igual» sobre MI PROPIA reseña?
 *
 * El servidor lo permite pasado un día desde la reseña Y desde mi última confirmación
 * (`FontCommentController.selfConfirmCooldown`), y refresca la fecha —«sigue igual» cada
 * vez que paso—. Pero el cliente escondía el botón del todo cuando la última reseña era
 * mía, resto de cuando auto-confirmar estaba prohibido: reportado con «la reseñé hace un
 * mes y no me deja volver a confirmar». Esta función replica la regla del servidor para
 * enseñar el botón solo cuando de verdad se puede (si no, daría 403 `confirm.tooSoon`).
 */
export const COOLDOWN_AUTOCONFIRMACION_MS = 24 * 60 * 60 * 1000

export function puedoConfirmarMiReseña(
  createdAt: string | null,
  lastConfirmedAt: string | null,
  ahora = Date.now(),
): boolean {
  const fechas = [createdAt, lastConfirmedAt]
    .map((f) => (f ? Date.parse(f) : NaN))
    .filter((n) => Number.isFinite(n))
  // Sin fechas no bloqueamos: que decida el servidor (es la autoridad).
  if (fechas.length === 0) return true
  return ahora - Math.max(...fechas) >= COOLDOWN_AUTOCONFIRMACION_MS
}
