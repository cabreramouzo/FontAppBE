import { esc, GUIA_META, recorta, shareCard, shareLang, siteOrigin, type Env } from './_meta'

/**
 * Etiquetas propias de la guía, compartidas por `/guia` y `/guide`.
 *
 * La guía existe **para que la encuentre un buscador**, y un buscador no ejecuta React:
 * sin esto, `/guia` sale con el `<title>` y la descripción genéricos de la portada, o sea
 * una copia más de la home. Es la misma pieza que `places/[slug]`, pero sin backend: los
 * textos son estáticos (CA/ES).
 *
 * `canonicalPath` **consolida las dos URLs en una**: `/guia` y su alias inglés `/guide`
 * sirven el mismo cuerpo, así que las dos declaran la misma canónica (`/guia`) para no
 * competir entre ellas por contenido duplicado. El día que la guía tenga cuerpo en inglés,
 * `/guide` pasará a ser su propia canónica con su meta.
 */
export async function escribeMetaGuia(
  ctx: Parameters<PagesFunction<Env>>[0],
  canonicalPath: string,
): Promise<Response> {
  const pagina = await ctx.next()
  // No es HTML (un asset, un 404…): no hay nada que reescribir.
  if (!pagina.headers.get('content-type')?.includes('text/html')) return pagina

  const origin = siteOrigin(ctx.request)
  const lang = shareLang(ctx.request)
  const ml = lang === 'es' ? 'es' : 'ca'
  const meta = GUIA_META[ml]
  const titulo = `${meta.title} · FontApp`
  const descripcion = recorta(meta.description, 200)
  const canonica = `${origin}${canonicalPath}`
  const imagen = `${origin}/${shareCard(ml)}`

  return new HTMLRewriter()
    .on('html', { element: (e) => { e.setAttribute('lang', ml) } })
    .on('title', { element: (e) => { e.setInnerContent(titulo) } })
    .on('meta[name="description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[property="og:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:url"]', { element: (e) => { e.setAttribute('content', `${canonica}?lang=${ml}`) } })
    .on('meta[property="og:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('meta[property="og:image:alt"]', { element: (e) => { e.setAttribute('content', titulo) } })
    // Las de Twitter YA existen en el index.html: se reescriben, no se añaden, o el
    // scraper coge la primera (la genérica). Mismo motivo que en las fichas.
    .on('meta[name="twitter:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[name="twitter:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[name="twitter:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('head', { element: (e) => { e.append(`<link rel="canonical" href="${esc(canonica)}">`, { html: true }) } })
    .transform(pagina)
}
