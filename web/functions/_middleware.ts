import { SHARE_META, shareCard, shareLang } from './_meta'

/**
 * Rutas que escriben sus PROPIAS etiquetas y a las que este middleware no debe tocar.
 *
 * El middleware envuelve a las funciones de ruta —llama a `ctx.next()` y transforma lo que
 * devuelven—, así que lo que escriba una función de ruta se pisa aquí **después**. Con
 * `/places/` fuera de esta lista, las 4.436 páginas de pueblo salían con el título y la
 * descripción genéricos aunque su función se hubiera ejecutado bien: para Google, 4.436
 * copias de la portada.
 *
 * No se vio leyendo el código —el fichero compila y la función corre— sino sirviendo la
 * página con `wrangler pages dev` y mirando el `<title>`. Al añadir una ruta con
 * metadatos propios hay que apuntarla aquí, y el síntoma de olvidarlo es exactamente ese:
 * todo parece bien y el buscador ve otra cosa.
 */
const CON_METADATOS_PROPIOS = ['/fonts/', '/places/']

/** Localiza la tarjeta genérica. Las rutas de arriba tienen la suya y no deben perder
 * ni la foto ni sus metadatos específicos. */
export const onRequest: PagesFunction = async (ctx) => {
  const response = await ctx.next()
  const url = new URL(ctx.request.url)
  if (CON_METADATOS_PROPIOS.some((p) => url.pathname.startsWith(p))
      || !response.headers.get('content-type')?.includes('text/html')) return response

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
