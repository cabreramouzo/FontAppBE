/**
 * A dónde volver después de entrar.
 *
 * El problema que resuelve: quien va a dejar su primera reseña y no tiene sesión acaba en
 * `/login`, y tras autenticarse aterriza en la portada —no en la fuente que estaba mirando—,
 * así que se pierde el hilo justo cuando iba a aportar. Con `?next=/fonts/:id` la reseña
 * sobrevive al desvío: se vuelve a la fuente.
 *
 * `next` **solo puede ser una ruta interna**. Sin esta guarda, un `?next=https://malo…`
 * convertiría el login en un redirector abierto hacia fuera (open redirect). Se aceptan
 * rutas que empiezan por una sola `/`; se rechazan `//host`, `/\host` y cualquier esquema.
 */
const loc = (globalThis as { location?: { search: string; pathname: string } }).location

export function safeNext(search: string = loc?.search ?? ''): string | null {
  let raw: string | null = null
  try {
    raw = new URLSearchParams(search).get('next')
  } catch {
    return null
  }
  if (!raw) return null
  // Interna: una sola barra al principio. `//` y `/\` son rutas protocolo-relativas que
  // saltan a otro host; cualquier otra cosa (http:, javascript:…) tampoco empieza por `/`.
  if (raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return null
  return raw
}

/**
 * URL de `/login` que vuelve a `path` (por defecto, la ruta actual completa) tras entrar.
 * Se usa en cada sitio que hoy manda a login a bocajarro y pierde el contexto.
 */
export function loginNext(path?: string): string {
  const destino = path ?? (loc ? loc.pathname + loc.search : '/')
  return `/login?next=${encodeURIComponent(destino)}`
}

/** Igual pero hacia `/register`, para el enlace cruzado que conserva el destino. */
export function withNext(base: string, next: string | null): string {
  return next ? `${base}?next=${encodeURIComponent(next)}` : base
}
