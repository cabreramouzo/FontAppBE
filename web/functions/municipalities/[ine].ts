import { apiOrigin, esc, MUNI_META, recorta, shareCard, shareLang, siteOrigin, type Env } from '../_meta'

/**
 * Etiquetas propias para la página de un municipio.
 *
 * ## Por qué hace falta
 *
 * Un rastreador —o el que pinta la vista previa de WhatsApp— **no ejecuta React**: lee el
 * `index.html` del SPA, que es el mismo para todo. Sin esto, mandarle a un ayuntamiento
 * «mira las fuentes de tu pueblo» llega como la tarjeta genérica de FontApp, sin decir de
 * qué pueblo es. Y ése es justo el enlace que se manda por correo mientras se valida el
 * producto territorial (ver `docs/ayuntamientos.md`), o sea el que más se juega.
 *
 * ## Y hay que apuntarla en el middleware
 *
 * `_middleware.ts` envuelve a las funciones de ruta, así que lo que escriben se pisa
 * **después** salvo que la ruta esté en `CON_METADATOS_PROPIOS`. No se ve leyendo el
 * código —compila y corre—: se ve sirviendo la página y mirando el `<title>`. Ya pasó con
 * `/places/`.
 *
 * ## Sin `noindex`, y sin sitemap tampoco
 *
 * Estas páginas todavía no se ofrecen a ningún buscador: son direcciones que se mandan por
 * correo mientras se valida. No llevan `noindex` porque no hay nada que esconder —lo que
 * enseñan ya está en el mapa— pero tampoco entran en el sitemap: ofrecer 5.551 municipios
 * de golpe, casi todos con tres fuentes sin comprobar, es exactamente el contenido de
 * relleno que ya se decidió no publicar con las fichas.
 */
interface MuniDTO {
  municipality: string
  ine: string
  fonts: number
  checkedEver: number
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const pagina = await ctx.next()

  const api = apiOrigin(ctx.env)
  const ine = String(ctx.params.ine ?? '')
  // Cinco dígitos y nada más: cualquier otra cosa es un enlace roto y no merece una
  // petición de red por visita.
  if (!api || !/^\d{5}$/.test(ine)) return pagina

  let datos: MuniDTO
  try {
    const res = await fetch(`${api}/municipalities/${ine}`, {
      // Una hora. El inventario de un municipio cambia cuando alguien reseña, no cada
      // minuto, y esta ruta la van a pedir sobre todo scrapers de vista previa.
      cf: { cacheTtl: 3600, cacheEverything: true },
    })
    if (!res.ok) return pagina
    datos = await res.json()
  } catch {
    // Si algo falla, la página tal cual: lo peor posible es volver a la tarjeta genérica.
    return pagina
  }

  const origin = siteOrigin(ctx.request)
  const canonica = `${origin}/municipalities/${datos.ine}`
  const lang = shareLang(ctx.request)
  const meta = MUNI_META[lang]

  const titulo = `${meta.title.replace('{p}', datos.municipality)} · FontApp`
  const descripcion = recorta(
    meta.description
      .replace('{n}', String(datos.fonts))
      .replace('{c}', String(datos.checkedEver))
      .replace('{p}', datos.municipality),
    200)
  // Siempre la tarjeta genérica del idioma: aquí no se elige la foto de una fuente porque
  // la página no va de una fuente, va de un municipio entero, y una foto cualquiera de las
  // veintiséis representaría al pueblo por sorteo.
  const imagen = `${origin}/${shareCard(lang)}`

  return new HTMLRewriter()
    .on('title', { element: (e) => { e.setInnerContent(titulo) } })
    .on('meta[name="description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[property="og:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:url"]', { element: (e) => { e.setAttribute('content', `${canonica}?lang=${lang}`) } })
    .on('meta[property="og:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('meta[property="og:image:alt"]', { element: (e) => { e.setAttribute('content', datos.municipality) } })
    // Las de Twitter YA EXISTEN en el index.html: se reescriben, no se añaden, o el
    // scraper coge la primera —la genérica— y todo esto no sirve de nada.
    .on('meta[name="twitter:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[name="twitter:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[name="twitter:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('head', {
      element: (e) => { e.append(`<link rel="canonical" href="${esc(canonica)}">`, { html: true }) },
    })
    .transform(pagina)
}
