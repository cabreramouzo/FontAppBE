/**
 * Mantener la sesión abierta SIN COBERTURA.
 *
 * El bug reportado en el campo: al arrancar la app sin red, la petición que recupera el
 * usuario del token falla, y como no había usuario que poner, la app **aparecía
 * deslogueada** — «Mi perfil» llevaba al acceso, el botón de añadir mostraba el aviso de
 * sin sesión, y la cola quedaba sin dueño. El token seguía intacto: no era un cierre de
 * sesión, era que no había nada que enseñar. En el monte, que es donde se usa la app, eso
 * es lo peor.
 *
 * La regla: **solo un 401 cierra sesión.** Un fallo de red no dice nada del token, así que
 * se conserva la sesión y se usa el último usuario conocido, cacheado aquí.
 */
export function sesionCaducada(e: unknown): boolean {
  // Por forma y no con `instanceof ApiError`: importar `ApiError` (que arrastra
  // `api/client` → `import.meta.env`) haría este módulo no importable desde un test de
  // Node. Un `ApiError` siempre lleva `status`, así que basta con mirarlo.
  return typeof e === 'object' && e !== null && (e as { status?: unknown }).status === 401
}

const USER_CACHE_KEY = 'fontapp_user'

// Genérico y sin importar `UserResponse`: así este módulo no arrastra ningún import de
// runtime y se puede probar desde un test de Node. Quien llama pone el tipo real.

/** Guarda el último usuario conocido para poder seguir logueado offline. */
export function guardaUsuarioCache(u: { id: string }): void {
  try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u)) } catch { /* modo privado: sin caché, nada más */ }
}

export function olvidaUsuarioCache(): void {
  try { localStorage.removeItem(USER_CACHE_KEY) } catch { /* */ }
}

/** El usuario cacheado, o `null` si no hay o está corrupto. Debe tener `id`. */
export function usuarioCache<T extends { id: string } = { id: string }>(): T | null {
  try {
    const s = localStorage.getItem(USER_CACHE_KEY)
    if (!s) return null
    const u = JSON.parse(s) as T
    return u && typeof u.id === 'string' ? u : null
  } catch {
    return null
  }
}
