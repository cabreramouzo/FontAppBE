/**
 * La forma de un error de la API y cómo se cuenta en la lengua de quien lee.
 *
 * Vive aquí y no en `api/client.ts` por dos razones. La primera es que no tiene nada que
 * ver con hablar por red: es decidir qué frase enseñar. La segunda es práctica y decidió
 * el sitio — `client.ts` lee `import.meta.env` al cargarse, así que **no se puede
 * importar desde un test de Node**, y esto es justo lo que hay que probar.
 */
export class ApiError extends Error {
  status: number // 0 = fallo de red / servidor inalcanzable
  /**
   * Código estable del servidor (`user.emailTaken`), si el error lo trae.
   *
   * Es lo que permite enseñar el motivo **en el idioma de quien lee**. No todos los
   * errores lo llevan: se están convirtiendo poco a poco y los que faltan caen en la
   * frase del servidor, que va en castellano. Ver `AppError` en el backend.
   */
  code?: string
  retryAfterSeconds?: number
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Traduce un error de red/API a un mensaje legible en el idioma actual. */
export function describeError(e: unknown, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return t('error.network')
    // El código manda sobre todo lo demás **menos** sobre el fallo de red: un 401 con
    // código propio («el enlace ha caducado») dice bastante más que «no autorizado».
    if (e.code === 'image.rateLimit' && e.retryAfterSeconds != null) {
      return t('err.image.rateLimit', { minutes: Math.max(1, Math.ceil(e.retryAfterSeconds / 60)) })
    }
    const traducido = e.code ? traduceCodigo(e.code, t) : null
    if (traducido) return traducido
    // Un 429 **sin código propio**: los topes de lectura no pasan `errorCode`, así que
    // aquí llegaba el `reason` del servidor en castellano, o nada. Se trata por estado y
    // no por código a propósito — así lo cubre de una vez cualquier ruta con tope, las
    // que hay y las que se añadan, sin tener que acordarse en cada una.
    if (e.status === 429) {
      return e.retryAfterSeconds != null
        ? t('error.tooManyRetry', { minutes: Math.max(1, Math.ceil(e.retryAfterSeconds / 60)) })
        : t('error.tooMany')
    }
    if (e.status === 401) return t('error.unauthorized')
    return e.message || t('error.generic')
  }
  return (e as Error)?.message || t('error.generic')
}

/**
 * La traducción de un código del servidor, o `null` si no la tenemos.
 *
 * El `null` es lo importante y por eso esto no es un `t()` a pelo: `t()` devuelve **la
 * clave cruda** cuando no la encuentra, así que un código nuevo del servidor —o uno
 * viejo en un cliente sin actualizar— pintaría literalmente «err.user.emailTaken» en un
 * Alert. Devolviendo `null` se cae en la frase del servidor, que está en castellano pero
 * al menos es una frase. Misma regla que los nombres de país en `lib/countries.ts`.
 */
function traduceCodigo(code: string, t: (key: string, params?: Record<string, string | number>) => string): string | null {
  const clave = `err.${code}`
  const texto = t(clave)
  return texto === clave ? null : texto
}
