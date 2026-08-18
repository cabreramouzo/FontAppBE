import { apiOrigin, esc, siteOrigin, type Env } from './_meta'

/**
 * El sitemap, generado al vuelo desde el backend.
 *
 * ## Por qué no se genera en el build
 *
 * Porque entonces envejece con el despliegue: cada foto nueva sería una página que Google
 * no sabe que existe hasta el siguiente `git push`, y aquí se despliega cuando toca, no
 * cuando alguien sube una foto. Un rastreador pide esto una vez al día como mucho, y va
 * cacheado una hora en el borde, así que «al vuelo» cuesta prácticamente nada.
 *
 * ## Qué entra
 *
 * Lo decide el backend (`GET /sitemap/fonts`): solo las fichas con foto, descripción o
 * alguna reseña. El porqué está en `SitemapController` — sesenta mil páginas con un
 * nombre y unas coordenadas no son sesenta mil páginas indexadas, son un sitio en el que
 * Google deja de fiarse.
 */
interface Entry { id: string; lastmod: string }

/** Las páginas que existen aunque nadie haya aportado nada, con su prioridad relativa. */
const ESTATICAS: [string, string][] = [
  ['/', '1.0'],
  ['/activity', '0.7'],
  ['/zones', '0.7'],
  ['/gamification', '0.5'],
  ['/legal', '0.3'],
]

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  // Sin el `www.`: un sitemap que lista las dos formas del dominio las enfrenta.
  const origin = siteOrigin(ctx.request)
  const api = apiOrigin(ctx.env)

  let fuentes: Entry[] = []
  if (api) {
    try {
      const res = await fetch(`${api}/sitemap/fonts`, {
        cf: { cacheTtl: 3600, cacheEverything: true },
      })
      if (res.ok) fuentes = await res.json()
    } catch {
      // Sin backend se sirve igualmente el sitemap de las estáticas. Un sitemap corto es
      // mejor que un 500: un 500 repetido hace que Search Console deje de pedirlo.
    }
  }

  const urls = [
    ...ESTATICAS.map(([ruta, prio]) =>
      `  <url><loc>${esc(origin + ruta)}</loc><priority>${prio}</priority></url>`),
    ...fuentes.map((f) =>
      `  <url><loc>${esc(`${origin}/fonts/${f.id}`)}</loc>` +
      `<lastmod>${esc(f.lastmod.slice(0, 10))}</lastmod></url>`),
  ]

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    },
  )
}
