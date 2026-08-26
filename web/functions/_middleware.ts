import { SHARE_META, shareCard, shareLang } from './_meta'

/** Localiza la tarjeta genérica. Las fichas tienen su propia función y no deben perder
 * la foto de la fuente ni sus metadatos específicos. */
export const onRequest: PagesFunction = async (ctx) => {
  const response = await ctx.next()
  const url = new URL(ctx.request.url)
  if (url.pathname.startsWith('/fonts/') || !response.headers.get('content-type')?.includes('text/html')) return response

  const lang = shareLang(ctx.request)
  const meta = SHARE_META[lang]
  const origin = url.origin.replace('://www.', '://')
  const sharedUrl = `${origin}${url.pathname}?lang=${lang}`
  const image = `${origin}/${shareCard(lang)}`

  return new HTMLRewriter()
    .on('html', { element: (e) => { e.setAttribute('lang', lang) } })
    .on('title', { element: (e) => { e.setInnerContent(meta.title) } })
    .on('meta[name="description"]', { element: (e) => { e.setAttribute('content', meta.description) } })
    .on('meta[property="og:title"]', { element: (e) => { e.setAttribute('content', meta.title) } })
    .on('meta[property="og:description"]', { element: (e) => { e.setAttribute('content', meta.description) } })
    .on('meta[property="og:url"]', { element: (e) => { e.setAttribute('content', sharedUrl) } })
    .on('meta[property="og:image"]', { element: (e) => { e.setAttribute('content', image) } })
    .on('meta[property="og:image:alt"]', { element: (e) => { e.setAttribute('content', meta.title) } })
    .on('meta[property="og:locale"]', { element: (e) => { e.setAttribute('content', meta.locale) } })
    .on('meta[name="twitter:title"]', { element: (e) => { e.setAttribute('content', meta.title) } })
    .on('meta[name="twitter:description"]', { element: (e) => { e.setAttribute('content', meta.description) } })
    .on('meta[name="twitter:image"]', { element: (e) => { e.setAttribute('content', image) } })
    .transform(response)
}
