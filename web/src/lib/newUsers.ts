// "Usuarios nuevos desde la última vez que miré". La marca de tiempo vive en el
// navegador: no hace falta tocar la BD y, como es información para mirar de reojo (no
// una tarea pendiente), que cada dispositivo lleve su cuenta es un precio asumible.
const SEEN_KEY = 'fontapp_users_seen_at'

/** Fecha desde la que contamos. La primera vez es AHORA: así el distintivo empieza a
 *  cero en vez de soltar de golpe el total histórico de usuarios. */
export function lastSeenAt(): string {
  const stored = localStorage.getItem(SEEN_KEY)
  if (stored) return stored
  const now = new Date().toISOString()
  localStorage.setItem(SEEN_KEY, now)
  return now
}

/** Marca como visto (al entrar en el panel). */
export function markUsersSeen() {
  localStorage.setItem(SEEN_KEY, new Date().toISOString())
}
