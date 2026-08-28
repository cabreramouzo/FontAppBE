import { apiOrigin, esc, PLACE_META, recorta, shareCard, shareLang, siteOrigin, type Env } from '../_meta'

/**
 * Etiquetas propias para cada página de pueblo.
 *
 * ## Por qué esto no es opcional
 *
 * Estas páginas existen **para que las encuentre un buscador**, y un buscador no ejecuta
 * React: lo que lee es el `index.html` que sirve el SPA, que es el mismo para todas. Sin
 * esto, las 4.436 páginas de pueblo comparten `<title>`, descripción y `og:url` — o sea
 * que para Google son 4.436 copias de la portada, que es peor que no tenerlas: contenido
 * duplicado a escala.
 *
 * Es la misma pieza que `fonts/[id].ts` y por los mismos motivos; lo que cambia es de
 * dónde salen los datos y que aquí el `<h1>` que verá el rastreador tiene que coincidir
 * con lo que la página pinta después.
 *
 * ## La regla que comparte con el sitemap
 *
 * Un pueblo con menos de tres fuentes **no entra en el sitemap** y aquí lleva `noindex`.
 * Las dos mitades tienen que decir lo mismo: ofrecer en el sitemap lo que no queremos
 * indexado, o al revés, es mandarle señales contradictorias al rastreador.
 */
const MIN_FUENTES_INDEXABLE = 3

interface PlaceDTO {
  slug: string
  name: string
  region: string | null
  country: string | null
  fontCount: number
}

interface PlacePage {
  place: PlaceDTO
  fonts: { image: string | null }[]
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const pagina = await ctx.next()

  const api = apiOrigin(ctx.env)
  const slug = String(ctx.params.slug ?? '')
  // Solo un slug con forma de slug llega a preguntar al backend: cualquier otra cosa es
  // un enlace roto y no merece una petición de red por visita.
  if (!api || !/^[a-z0-9-]{1,80}$/.test(slug)) return pagina

  let datos: PlacePage
  try {
    const res = await fetch(`${api}/places/${slug}`, {
      // Una hora: el contenido de un pueblo cambia cuando alguien reseña, no cada minuto,
      // y estas páginas van a recibir rastreadores más que personas.
      cf: { cacheTtl: 3600, cacheEverything: true },
    })
    if (!res.ok) return pagina
    datos = await res.json()
  } catch {
    // Si algo falla se devuelve la página tal cual: lo peor que puede pasar es volver a
    // la tarjeta genérica, nunca dejar la web en blanco.
    return pagina
  }

  const { place } = datos
  const origin = siteOrigin(ctx.request)
  const canonica = `${origin}/places/${place.slug}`
  const lang = shareLang(ctx.request)
  const meta = PLACE_META[lang]

  const nombre = place.region ? `${place.name} (${place.region})` : place.name
  const titulo = `${meta.title.replace('{p}', nombre)} · FontApp`
  const descripcion = recorta(
    meta.description.replace('{n}', String(place.fontCount)).replace('{p}', place.name), 200)

  // Si alguna fuente del pueblo tiene foto, esa manda: es una foto **de ahí**, hecha por
  // alguien que estuvo delante, y dice mucho más que la tarjeta genérica. Se coge la
  // primera —las fuentes vienen ordenadas por cercanía al centro del pueblo.
  // Los SVG se descartan: WhatsApp, Telegram y compañía no los pintan, así que una
  // tarjeta con un SVG sale **sin imagen**, que es peor que salir con la genérica. En
  // producción las fotos son JPEG de R2 y esto no se dispara; se vio en local, donde
  // `seed --demo` mete `/demo/*.svg` y la tarjeta se quedaba muda.
  const foto = datos.fonts?.find((f) => f.image && !/\.svg($|\?)/i.test(f.image))?.image ?? null
  const propia = !!foto
  const imagen = foto
    ? (/^https?:\/\//.test(foto) ? foto : api + foto)
    : `${origin}/${shareCard(lang)}`

  return new HTMLRewriter()
    .on('title', { element: (e) => { e.setInnerContent(titulo) } })
    .on('meta[name="description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[property="og:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:url"]', { element: (e) => { e.setAttribute('content', `${canonica}?lang=${lang}`) } })
    .on('meta[property="og:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('meta[property="og:image:alt"]', { element: (e) => { e.setAttribute('content', nombre) } })
    // Las medidas del HTML son las de la tarjeta genérica (1200×630). La foto de una
    // fuente la hizo alguien con el móvil y es vertical la mitad de las veces.
    .on('meta[property="og:image:width"]', { element: (e) => { if (propia) e.remove() } })
    .on('meta[property="og:image:height"]', { element: (e) => { if (propia) e.remove() } })
    // Las de Twitter YA EXISTEN en el index.html: hay que reescribirlas, no añadirlas, o
    // el scraper se queda con la primera —la genérica— y todo esto no sirve de nada.
    .on('meta[name="twitter:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[name="twitter:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[name="twitter:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('head', {
      element: (e) => {
        e.append(
          `<link rel="canonical" href="${esc(canonica)}">` +
          (place.fontCount < MIN_FUENTES_INDEXABLE
            ? `<meta name="robots" content="noindex,follow">`
            : ''),
          { html: true },
        )
      },
    })
    .transform(pagina)
}
