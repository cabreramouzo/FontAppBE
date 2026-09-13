/**
 * Ayudas compartidas de las funciones de Cloudflare Pages.
 *
 * Los ficheros que empiezan por `_` no son rutas, así que este no se sirve.
 */

export interface Env {
  /** Origen del backend. Pages expone las variables del panel también en tiempo de
   *  ejecución, así que la misma `VITE_API_URL` que usa el build vale aquí y no hay que
   *  configurar nada nuevo. `API_ORIGIN` existe solo por si algún día se separan. */
  API_ORIGIN?: string
  VITE_API_URL?: string
  /** Stripe only exists at runtime in Pages Functions. Never expose these as VITE_ vars:
   *  Vite deliberately embeds those in the browser bundle. */
  STRIPE_SECRET_KEY?: string
  STRIPE_ONE_TIME_PRICE_ID?: string
  STRIPE_MONTHLY_PRICE_ID?: string
}

export type ShareLang = 'ca' | 'es' | 'gl' | 'eu' | 'en' | 'fr' | 'pt' | 'it'

export const SHARE_META: Record<ShareLang, { locale: string; title: string; description: string; unnamed: string }> = {
  ca: { locale: 'ca_ES', title: "FontApp · fonts d'aigua a prop teu", description: "Troba fonts d'aigua a prop teu i consulta'n l'estat abans de desviar-te.", unnamed: "Font d'aigua" },
  es: { locale: 'es_ES', title: 'FontApp · fuentes de agua cerca de ti', description: 'Encuentra fuentes de agua y comprueba su estado antes de desviarte.', unnamed: 'Fuente de agua' },
  gl: { locale: 'gl_ES', title: 'FontApp · fontes de auga preto de ti', description: 'Atopa fontes de auga e comproba o seu estado antes de desviarte.', unnamed: 'Fonte de auga' },
  eu: { locale: 'eu_ES', title: 'FontApp · ur-iturriak zugandik gertu', description: 'Aurkitu ur-iturriak eta begiratu haien egoera bidetik desbideratu aurretik.', unnamed: 'Ur-iturria' },
  en: { locale: 'en_GB', title: 'FontApp · water fountains near you', description: 'Find water fountains and check their status before making a detour.', unnamed: 'Water fountain' },
  fr: { locale: 'fr_FR', title: "FontApp · points d'eau près de vous", description: "Trouvez des points d'eau et vérifiez leur état avant de faire un détour.", unnamed: "Point d'eau" },
  pt: { locale: 'pt_PT', title: 'FontApp · fontes de água perto de si', description: 'Encontre fontes de água e verifique o seu estado antes de fazer um desvio.', unnamed: 'Fonte de água' },
  it: { locale: 'it_IT', title: 'FontApp · fontane d’acqua vicino a te', description: 'Trova fontane d’acqua e controlla il loro stato prima di fare una deviazione.', unnamed: 'Fontana d’acqua' },
}

/**
 * Los textos de una página de pueblo, por idioma.
 *
 * Van aquí y no en el diccionario del cliente porque un rastreador **no ejecuta React**:
 * lo único que lee es lo que sale ya escrito en el HTML. Son los mismos textos que la
 * página pinta después, escritos dos veces a la fuerza — el precio de ser un SPA.
 *
 * `{p}` es el nombre del pueblo y `{n}` cuántas fuentes hay cerca.
 */
export const PLACE_META: Record<ShareLang, { title: string; description: string }> = {
  ca: { title: "Fonts d'aigua a {p}", description: "{n} fonts d'aigua a prop de {p}. Mira'n l'estat abans d'anar-hi: qui hi passa diu si en surt aigua." },
  es: { title: 'Fuentes de agua en {p}', description: '{n} fuentes de agua cerca de {p}. Mira su estado antes de ir: quien pasa dice si sale agua.' },
  gl: { title: 'Fontes de auga en {p}', description: '{n} fontes de auga preto de {p}. Mira o seu estado antes de ir: quen pasa di se sae auga.' },
  eu: { title: '{p}(e)ko ur-iturriak', description: '{p} inguruan {n} ur-iturri. Begiratu egoera joan aurretik: pasatzen denak esaten du ura badariola.' },
  en: { title: 'Water fountains in {p}', description: '{n} water fountains near {p}. Check their status before you go: whoever passes says if the water is flowing.' },
  fr: { title: "Points d'eau à {p}", description: "{n} points d'eau près de {p}. Vérifiez leur état avant d'y aller : ceux qui passent disent s'il y a de l'eau." },
  pt: { title: 'Fontes de água em {p}', description: '{n} fontes de água perto de {p}. Vê o estado antes de ir: quem passa diz se sai água.' },
  it: { title: 'Fontane d’acqua a {p}', description: '{n} fontane d’acqua vicino a {p}. Controlla lo stato prima di andare: chi passa dice se c’è acqua.' },
}

/**
 * La tarjeta de la página de un municipio.
 *
 * Dice **cuántas hay y cuántas ha comprobado alguien**, no solo cuántas hay: es la misma
 * honestidad que la página, y en un chat o en un correo a un ayuntamiento esa segunda
 * cifra es justo la que abre la conversación. Prometer «26 fuentes» a secas y que al
 * abrir resulte que ninguna está comprobada es empezar por el peor sitio.
 */
export const MUNI_META: Record<ShareLang, { title: string; description: string }> = {
  ca: { title: 'Fonts de {p}', description: '{n} fonts al mapa de {p}, {c} comprovades alguna vegada. Dades públiques i obertes.' },
  es: { title: 'Fuentes de {p}', description: '{n} fuentes en el mapa de {p}, {c} comprobadas alguna vez. Datos públicos y abiertos.' },
  gl: { title: 'Fontes de {p}', description: '{n} fontes no mapa de {p}, {c} comprobadas algunha vez. Datos públicos e abertos.' },
  eu: { title: '{p} iturriak', description: '{p}(e)ko mapan {n} iturri, {c} noizbait egiaztatuak. Datu publiko eta irekiak.' },
  en: { title: 'Fountains in {p}', description: '{n} fountains on the map of {p}, {c} checked at least once. Public, open data.' },
  fr: { title: 'Fontaines de {p}', description: '{n} fontaines sur la carte de {p}, {c} vérifiées au moins une fois. Données publiques et ouvertes.' },
  pt: { title: 'Fontes de {p}', description: '{n} fontes no mapa de {p}, {c} verificadas alguma vez. Dados públicos e abertos.' },
  it: { title: 'Fontane di {p}', description: '{n} fontane sulla mappa di {p}, {c} controllate almeno una volta. Dati pubblici e aperti.' },
}

/**
 * La tarjeta y las etiquetas de la guía `/guia`.
 *
 * Solo CA y ES: el cuerpo de la guía (`GuiaPage`) únicamente existe en esos dos idiomas y
 * los demás caen a CA. La meta acompaña —dar título y descripción en inglés sobre un
 * cuerpo en catalán es el desajuste que penaliza Google—, así que quien pida otro idioma
 * recibe la meta en CA, igual que el cuerpo.
 */
export const GUIA_META: Record<'ca' | 'es', { title: string; description: string }> = {
  ca: { title: 'Com funciona FontApp', description: "Guia ràpida per fer servir FontApp: troba fonts d'aigua a prop, digues si ragen amb un toc i, pujant el teu GPX, mira quines fonts hi ha per la teva ruta i el tram més llarg sense aigua." },
  es: { title: 'Cómo funciona FontApp', description: 'Guía rápida para usar FontApp: encuentra fuentes de agua cerca, di si manan con un toque y, subiendo tu GPX, mira qué fuentes hay por tu ruta y el tramo más largo sin agua.' },
}

/**
 * El directorio de pueblos `/places`. Su valor SEO es sobre todo enlazar hacia las páginas
 * por pueblo, pero un título propio evita que parezca una copia de la portada.
 */
export const PLACES_META: Record<ShareLang, { title: string; description: string }> = {
  ca: { title: 'Fonts per poble', description: "Tots els pobles amb fonts d'aigua al mapa de FontApp. Mira quines fonts hi ha a prop de cada poble i el seu estat." },
  es: { title: 'Fuentes por pueblo', description: 'Todos los pueblos con fuentes de agua en el mapa de FontApp. Mira qué fuentes hay cerca de cada pueblo y su estado.' },
  gl: { title: 'Fontes por vila', description: 'Todas as vilas con fontes de auga no mapa de FontApp. Mira que fontes hai preto de cada vila e o seu estado.' },
  eu: { title: 'Iturriak herriz herri', description: 'FontApp mapako ur-iturriak dituzten herri guztiak. Begiratu zer iturri dauden herri bakoitzetik gertu eta haien egoera.' },
  en: { title: 'Fountains by town', description: 'Every town with water fountains on the FontApp map. See which fountains are near each town and their status.' },
  fr: { title: 'Fontaines par commune', description: "Toutes les communes avec des points d'eau sur la carte FontApp. Voyez les fontaines près de chaque commune et leur état." },
  pt: { title: 'Fontes por localidade', description: 'Todas as localidades com fontes de água no mapa de FontApp. Vê que fontes há perto de cada uma e o seu estado.' },
  it: { title: 'Fontane per paese', description: "Tutti i paesi con fontane d'acqua sulla mappa di FontApp. Guarda quali fontane ci sono vicino a ogni paese e il loro stato." },
}

/**
 * Los idiomas que tienen su propia tarjeta `public/og-card-<lang>.jpg`.
 *
 * Existe porque la tarjeta es una **imagen con texto dentro** y no se genera desde el
 * código: al añadir un idioma hay que dibujarla, y mientras no esté, `og:image` apuntaría
 * a un fichero que no existe y el enlace compartido saldría **sin ninguna imagen**, que
 * es peor que salir con la de otro idioma. El respaldo es `en` y no `ca`: quien comparte
 * en un idioma sin tarjeta es, por definición, alguien de fuera.
 *
 * Al dibujar `og-card-<lang>.jpg`, añadir aquí su código. Si se olvida no se rompe nada
 * visible — de ahí el aviso.
 */
const CON_TARJETA = new Set<ShareLang>(['ca', 'es', 'gl', 'eu', 'en', 'fr', 'pt', 'it'])

/** El fichero de la tarjeta genérica de un idioma, con respaldo si aún no está dibujada. */
export function shareCard(lang: ShareLang): string {
  return `og-card-${CON_TARJETA.has(lang) ? lang : 'en'}.jpg`
}

export function shareLang(req: Request): ShareLang {
  const lang = new URL(req.url).searchParams.get('lang')
  return lang && lang in SHARE_META ? lang as ShareLang : 'ca'
}

/** El origen del backend, o `null` si no está configurado. */
export function apiOrigin(env: Env): string | null {
  const raw = (env.API_ORIGIN || env.VITE_API_URL || '').trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(raw) ? raw : null
}

/** Escapa para meterlo dentro de un atributo HTML o de un nodo de texto XML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Recorta sin partir una palabra por la mitad. */
export function recorta(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max)
  const espacio = corte.lastIndexOf(' ')
  return (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd() + '…'
}

/**
 * El origen **canónico** del sitio para esta petición.
 *
 * `www.fontapp.net` y `fontapp.net` sirven los dos un 200 con el mismo contenido — no hay
 * redirección entre ellos. Con una canónica auto-referente, cada ficha existiría dos veces
 * para un buscador y se repartiría la señal entre las dos copias, que es peor que no poner
 * canónica. Se quita el `www.` y con eso las dos apuntan a la misma.
 */
export function siteOrigin(req: Request): string {
  const u = new URL(req.url)
  u.hostname = u.hostname.replace(/^www\./, '')
  return u.origin
}
