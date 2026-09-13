import { esc, GUIA_META, recorta, shareCard, shareLang, siteOrigin, type Env } from './_meta'

/**
 * Etiquetas propias de la guía, compartidas por `/guia` y `/guide`.
 *
 * La guía existe **para que la encuentre un buscador**, y un buscador no ejecuta React:
 * sin esto sale con el `<title>` y la descripción genéricos de la portada, o sea una copia
 * más de la home.
 *
 * Cada URL declara SU canónica y su idioma: `/guia` es CA/ES (por `?lang`), `/guide` es la
 * inglesa (`forzarLang: 'en'`). No se consolidan —el cuerpo ya existe en inglés—, y en su
 * lugar se enlazan con `hreflang` para que Google las trate como traducciones y no como
 * duplicados. Es la misma pieza que `places/[slug]`, pero sin backend: textos estáticos.
 */
export async function escribeMetaGuia(
  ctx: Parameters<PagesFunction<Env>>[0],
  canonicalPath: string,
  forzarLang?: 'ca' | 'es' | 'en',
): Promise<Response> {
  const pagina = await ctx.next()
  // No es HTML (un asset, un 404…): no hay nada que reescribir.
  if (!pagina.headers.get('content-type')?.includes('text/html')) return pagina

  const origin = siteOrigin(ctx.request)
  const lang = shareLang(ctx.request)
  // El inglés lo fuerza `/guide`; `/guia` sigue a `?lang` (es) y por defecto CA.
  const ml = forzarLang ?? (lang === 'es' ? 'es' : 'ca')
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
    // Canónica propia + hreflang: la guía vive en dos URLs y tres idiomas, y así Google
    // las relaciona como traducciones en vez de que compitan. x-default a la CA/ES.
    .on('head', {
      element: (e) => {
        e.append(
          `<link rel="canonical" href="${esc(canonica)}">`
          + `<link rel="alternate" hreflang="ca" href="${esc(`${origin}/guia`)}">`
          + `<link rel="alternate" hreflang="es" href="${esc(`${origin}/guia?lang=es`)}">`
          + `<link rel="alternate" hreflang="en" href="${esc(`${origin}/guide`)}">`
          + `<link rel="alternate" hreflang="x-default" href="${esc(`${origin}/guia`)}">`,
          { html: true },
        )
      },
    })
    .transform(pagina)
}
