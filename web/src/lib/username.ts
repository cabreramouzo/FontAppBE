/**
 * Qué nombre de usuario vale.
 *
 * **Es la misma regla que `Mentions.isMentionable` en el servidor**, y por eso vive en un
 * módulo y no dentro de una pantalla: la usan el registro y el formulario de `/me`, y una
 * segunda copia se queda vieja sola. Que las dos digan lo mismo no es cosmético — un
 * nombre que el servidor acepta pero el parser de menciones no reconoce **manda el aviso
 * a otra persona**: `@josé maría` menciona a `jos`.
 *
 * Existe además por un motivo de idioma. El servidor devuelve sus errores en castellano,
 * como todos los `reason` de esta API; validando aquí, la persona ve la regla **en su
 * idioma y antes de enviar**, que es cuando sirve de algo. El error del servidor queda de
 * red de seguridad para quien llame a la API directamente.
 */
const VALIDO = /^[a-zA-Z0-9_.-]{3,30}$/

export function esNombreValido(nombre: string): boolean {
  return VALIDO.test(nombre)
}
