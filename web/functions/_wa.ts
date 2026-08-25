import type { ShareLang } from './_meta'

/** Enlaces cortos fáciles de imprimir, dictar y reconocer en analítica. */
export function whatsappRedirect(request: Request, lang: ShareLang): Response {
  const target = new URL('/', request.url)
  target.searchParams.set('lang', lang)
  target.searchParams.set('p', 'whatsapp')
  return Response.redirect(target.toString(), 302)
}
