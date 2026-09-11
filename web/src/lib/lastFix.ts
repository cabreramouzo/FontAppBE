/**
 * El último fix del GPS, guardado para dar continuidad al abrir.
 *
 * En iOS el permiso de ubicación de una web **caduca cada 24 h** (límite de WebKit, no se
 * puede quitar sin envolver la app), así que al abrir por la mañana no hay punto azul hasta
 * volver a conceder. Con esto pintamos un punto **atenuado** en tu última posición conocida:
 * el mapa "sabe" dónde estás aunque el permiso haya caducado, y solo re-concedes si quieres
 * el punto en vivo. Va marcado como aproximado, nunca se afirma que sea de ahora.
 *
 * No caduca a las 24 h como el permiso, pero SÍ tiene un tope (`MAX_EDAD_DIAS`): más allá
 * podrías haber cambiado de ciudad y el punto mentiría. La decisión pura vive en `fixValido`
 * para poder testearla; `guardaFix`/`leeFix` solo le ponen el localStorage por encima.
 */
const CLAVE = 'fontapp:lastFix'
export const MAX_EDAD_DIAS = 14

/** Valida un fix leído del almacén: coordenadas reales, en rango, y no demasiado viejo. */
export function fixValido(
  o: unknown,
  ahora = Date.now(),
  maxEdadDias = MAX_EDAD_DIAS,
): [number, number] | null {
  if (!o || typeof o !== 'object') return null
  const { lat, lng, t } = o as { lat?: unknown; lng?: unknown; t?: unknown }
  if (![lat, lng, t].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const la = lat as number, ln = lng as number, ts = t as number
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null
  const edad = ahora - ts
  if (edad < 0) return null // reloj hacia atrás: no fiable
  if (edad > maxEdadDias * 24 * 60 * 60 * 1000) return null
  return [la, ln]
}

export function guardaFix(pos: [number, number], ahora = Date.now()): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ lat: pos[0], lng: pos[1], t: ahora }))
  } catch { /* modo privado / sin espacio: no pasa nada, es una comodidad */ }
}

export function leeFix(ahora = Date.now()): [number, number] | null {
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? fixValido(JSON.parse(raw), ahora) : null
  } catch { return null }
}
