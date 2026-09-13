import { esc, PLACES_META, recorta, shareCard, shareLang, siteOrigin, type Env } from './_meta'

/**
 * Etiquetas propias del directorio de pueblos `/places`.
 *
 * `functions/places/[slug].ts` cubre `/places/:slug`; este cubre `/places` a secas. Sin
 * él, el directorio saldría con el título genérico de la portada. La meta va en los ocho
 * idiomas (los rótulos de la página también), a diferencia de la guía, que solo tiene
 * cuerpo en CA/ES.
 */
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const pagina = await ctx.next()
  if (!pagina.headers.get('content-type')?.includes('text/html')) return pagina

  const origin = siteOrigin(ctx.request)
  const lang = shareLang(ctx.request)
  const meta = PLACES_META[lang]
  const titulo = `${meta.title} · FontApp`
  const descripcion = recorta(meta.description, 200)
  const canonica = `${origin}/places`
  const imagen = `${origin}/${shareCard(lang)}`

  return new HTMLRewriter()
    .on('html', { element: (e) => { e.setAttribute('lang', lang) } })
    .on('title', { element: (e) => { e.setInnerContent(titulo) } })
    .on('meta[name="description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[property="og:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:url"]', { element: (e) => { e.setAttribute('content', `${canonica}?lang=${lang}`) } })
    .on('meta[property="og:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('meta[property="og:image:alt"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[name="twitter:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[name="twitter:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[name="twitter:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('head', { element: (e) => { e.append(`<link rel="canonical" href="${esc(canonica)}">`, { html: true }) } })
    .transform(pagina)
}
