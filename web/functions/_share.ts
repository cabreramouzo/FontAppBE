import type { ShareLang } from './_meta.ts'

/**
 * Redirección corta de un canal social a la landing localizada.
 *
 * Enlaces fáciles de imprimir, dictar y reconocer en analítica (`?p=<canal>`), y con
 * `?lang=` para que el crawler que sí sigue el redirect —X va por t.co, así que lo
 * hace— reciba la tarjeta en el idioma del enlace y no la catalana por defecto.
 *
 * Absoluto a propósito (`new URL('/', request.url)`), no un `Location` relativo como el
 * `/tw` de `_redirects`: es el mismo mecanismo que ya funciona en WhatsApp.
 */
export function socialRedirect(request: Request, lang: ShareLang, source: string): Response {
  const target = new URL('/', request.url)
  target.searchParams.set('lang', lang)
  target.searchParams.set('p', source)
  return Response.redirect(target.toString(), 302)
}
