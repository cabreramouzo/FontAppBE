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
