import { apiOrigin, esc, recorta, siteOrigin, type Env } from '../_meta'

/**
 * Etiquetas propias para cada ficha de fuente.
 *
 * ## Qué arregla
 *
 * La web es un SPA: hay **un** `index.html` y lo sirve igual para las 60.000 fichas, así
 * que todas compartían `<title>`, `og:title`, `og:image` y —lo peor— un `og:url` fijo
 * apuntando a la portada. Quien comparte una fuente por WhatsApp manda una tarjeta que no
 * dice qué fuente es y que enlaza a otro sitio. Y el botón de compartir ya existe en la
 * ficha, o sea que el canal estaba montado y roto por el otro extremo.
 *
 * ## Por qué así y no con SSR
 *
 * No hace falta renderizar nada: la página la sigue pintando React en el navegador. Aquí
 * solo se reescriben seis etiquetas del `<head>` al vuelo con `HTMLRewriter`, que es
 * streaming y no cuesta prácticamente nada. Meter un framework de SSR para esto sería
 * cambiar toda la arquitectura del front por seis líneas de `<meta>`.
 *
 * ## Reglas que no se pueden romper
 *
 * - **Si algo falla, se devuelve la página tal cual.** Un backend caído o una fuente que
 *   ya no existe no pueden dejar la web en blanco: lo peor que puede pasar es volver a la
 *   tarjeta genérica de antes.
 * - **Las escondidas llevan `noindex`.** Una duplicada indexada compite con la buena por
 *   la misma búsqueda y pierden las dos. Sigue siendo visitable por enlace —la ficha
 *   individual explica a propósito por qué no está en el mapa—, pero no la ofrecemos.
 *
 * Ojo: el service worker cachea el shell, así que a quien ya tiene la app instalada puede
 * llegarle el HTML de antes. Da igual para lo que esto sirve — los rastreadores de
 * WhatsApp y de Google no ejecutan el service worker.
 */
interface FontDTO {
  id: string
  name: string
  description: string | null
  image: string | null
  region: string | null
  country: string | null
  duplicateOf: string | null
  retiredAt: string | null
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const pagina = await ctx.next()

  const api = apiOrigin(ctx.env)
  const id = String(ctx.params.id ?? '')
  // Solo un UUID llega a preguntar al backend: cualquier otra cosa es un enlace roto y
  // no merece una petición de red por visita.
  if (!api || !/^[0-9a-f-]{36}$/i.test(id)) return pagina

  let font: FontDTO
  try {
    const res = await fetch(`${api}/fonts/${id}`, {
      // Cacheado en el borde: una ficha no cambia de un minuto a otro y así compartir un
      // enlace muy visitado no se traduce en una petición al backend por visita.
      cf: { cacheTtl: 300, cacheEverything: true },
    })
    if (!res.ok) return pagina
    font = await res.json()
  } catch {
    return pagina
  }

  const origin = siteOrigin(ctx.request)
  const canonica = `${origin}/fonts/${font.id}`
  const zona = [font.region, font.country].filter(Boolean).join(', ')
  const titulo = `${font.name} · FontApp`

  // Si hay descripción, manda: la ha escrito una persona, dice algo de verdad y ya está
  // en el idioma que toca. La de repuesto es casi solo nombres propios a propósito —
  // aquí no hay a quién preguntarle qué idioma lee, así que cuanto menos texto, mejor.
  const descripcion = font.description?.trim()
    ? recorta(font.description, 200)
    : recorta([font.name, zona].filter(Boolean).join(' · ') + " · Font d'aigua a FontApp", 200)

  const propia = !!font.image
  const imagen = font.image
    ? (/^https?:\/\//.test(font.image) ? font.image : api + font.image)
    : `${origin}/og-card.jpg`

  const escondida = !!font.duplicateOf || !!font.retiredAt

  return new HTMLRewriter()
    .on('title', { element: (e) => { e.setInnerContent(titulo) } })
    .on('meta[name="description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[property="og:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[property="og:url"]', { element: (e) => { e.setAttribute('content', canonica) } })
    .on('meta[property="og:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('meta[property="og:image:alt"]', { element: (e) => { e.setAttribute('content', font.name) } })
    // El 1200×630 del HTML es el de la tarjeta genérica. La foto de una fuente la hizo
    // alguien con el móvil y es vertical la mitad de las veces: dejar las medidas puestas
    // le dice al scraper que recorte a un formato que no es el de la imagen.
    .on('meta[property="og:image:width"]', { element: (e) => { if (propia) e.remove() } })
    .on('meta[property="og:image:height"]', { element: (e) => { if (propia) e.remove() } })
    // Las de Twitter YA EXISTEN en el index.html, así que hay que reescribirlas y no
    // añadirlas: con la etiqueta repetida los scrapers se quedan con la primera, que es
    // justo la genérica que queríamos sustituir. (Descubierto ejecutándolo, no leyéndolo.)
    .on('meta[name="twitter:title"]', { element: (e) => { e.setAttribute('content', titulo) } })
    .on('meta[name="twitter:description"]', { element: (e) => { e.setAttribute('content', descripcion) } })
    .on('meta[name="twitter:image"]', { element: (e) => { e.setAttribute('content', imagen) } })
    .on('head', {
      element: (e) => {
        // La canónica sí falta en el HTML, así que ésta se añade de verdad.
        e.append(
          `<link rel="canonical" href="${esc(canonica)}">` +
          (escondida ? `<meta name="robots" content="noindex,follow">` : ''),
          { html: true },
        )
      },
    })
    .transform(pagina)
}
