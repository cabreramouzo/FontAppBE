/**
 * Keeping search crawlers from waking the database for pages we do not want indexed.
 *
 * Every fountain page a crawler has never asked for misses the edge cache and reaches the
 * API, which queries Neon. Measured on 25/09/2026: Applebot alone was asking for one
 * `/fonts/<id>` every ~24 s, so Neon never reached its five idle minutes and stayed on all
 * day and all night. There are ~173,000 fountains and the sitemap offers only the few
 * hundred a person has touched; the rest are not meant to be indexed anyway.
 *
 * So a **search or AI crawler** asking for a fountain outside the sitemap gets the generic
 * page with `noindex`, without any API call. Everyone else is untouched: people, and the
 * link-preview scrapers (WhatsApp, iMessage, Telegram…) that build the card when someone
 * shares a fountain — those always get the full card, sitemap or not.
 */

// Search engines and AI crawlers. Deliberately NOT the preview scrapers (facebookexternalhit,
// WhatsApp, Twitterbot, TelegramBot, Slackbot, Discordbot, LinkedInBot): a shared link is a
// person asking, and its card must name the fountain.
const CRAWLER_UA = /googlebot|google-inspectiontool|bingbot|applebot|yandex(bot|images)|duckduckbot|baiduspider|petalbot|seznambot|gptbot|oai-searchbot|claudebot|perplexitybot|ccbot|amazonbot|bytespider|meta-externalagent|google-extended/i

// Cloudflare's verified-bot categories that mean "crawling to index", not "previewing".
const CRAWLER_CATEGORIES = new Set(['Search Engine Crawler', 'Search Engine Optimization', 'AI Crawler', 'AI Search'])

export function isIndexingCrawler(userAgent: string | null, verifiedBotCategory?: string | null): boolean {
  if (verifiedBotCategory && CRAWLER_CATEGORIES.has(verifiedBotCategory)) return true
  return !!userAgent && CRAWLER_UA.test(userAgent)
}

const TTL_MS = 60 * 60 * 1000
const cached = new Map<string, { keys: Set<string>; at: number }>()

/**
 * The keys a sitemap endpoint offers (`id` for fountains, `slug` for places), refreshed at
 * most hourly per isolate — and the request itself is cached an hour at the edge, so this
 * costs about one API call an hour per list. `null` when it cannot be fetched: the caller
 * then behaves as before (asks the API), so a failure here can never hide a page that
 * should be indexed.
 */
async function sitemapKeys(api: string, path: string, field: 'id' | 'slug', now: number): Promise<Set<string> | null> {
  const hit = cached.get(path)
  if (hit && now - hit.at < TTL_MS) return hit.keys
  try {
    const res = await fetch(`${api}${path}`, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
    if (!res.ok) return hit?.keys ?? null
    const rows = (await res.json()) as Record<string, string>[]
    const keys = new Set(rows.map((r) => String(r[field]).toLowerCase()))
    cached.set(path, { keys, at: now })
    return keys
  } catch {
    return hit?.keys ?? null
  }
}

export const sitemapFontIDs = (api: string, now = Date.now()) => sitemapKeys(api, '/sitemap/fonts', 'id', now)

/**
 * Same gate for town pages. Measured 28–29/09/2026: with fountains gated, ~5,500 place-page
 * queries in 31 h (about three a minute, night included) kept Neon from ever suspending.
 * Only towns outside the sitemap (fewer than three fountains, already `noindex`) are cut;
 * the indexable ones keep their full page, since being found is their whole point.
 */
export const sitemapPlaceSlugs = (api: string, now = Date.now()) => sitemapKeys(api, '/sitemap/places', 'slug', now)

/** JSON safe inside a `<script>`: `<` escaped so a name can never close the tag. */
export function inlineJSON(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
