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
let cached: { ids: Set<string>; at: number } | null = null

/**
 * The fountain ids the sitemap offers, refreshed at most hourly per isolate — and the
 * request itself is cached an hour at the edge, so this costs about one API call an hour.
 * `null` when it cannot be fetched: the caller then behaves as before (asks the API), so a
 * failure here can never hide a fountain that should be indexed.
 */
export async function sitemapFontIDs(api: string, now = Date.now()): Promise<Set<string> | null> {
  if (cached && now - cached.at < TTL_MS) return cached.ids
  try {
    const res = await fetch(`${api}/sitemap/fonts`, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
    if (!res.ok) return cached?.ids ?? null
    const rows: { id: string }[] = await res.json()
    cached = { ids: new Set(rows.map((r) => r.id.toLowerCase())), at: now }
    return cached.ids
  } catch {
    return cached?.ids ?? null
  }
}
