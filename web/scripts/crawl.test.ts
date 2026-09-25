import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isIndexingCrawler } from '../functions/_crawl.ts'

test('search and AI crawlers are recognised', () => {
  assert.ok(isIndexingCrawler('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)'))
  assert.ok(isIndexingCrawler('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))
  assert.ok(isIndexingCrawler('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0)'))
  assert.ok(isIndexingCrawler('Mozilla/5.0 (compatible; GPTBot/1.1)'))
  // Cloudflare's category alone is enough, whatever the user agent says.
  assert.ok(isIndexingCrawler('Mozilla/5.0', 'Search Engine Crawler'))
})

test('link-preview scrapers and people are not crawlers: shared cards must stay full', () => {
  for (const ua of [
    'WhatsApp/2.23.20.0 A',
    'facebookexternalhit/1.1 Facebot Twitterbot/1.0', // iMessage previews
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ]) assert.equal(isIndexingCrawler(ua), false, ua)
  assert.equal(isIndexingCrawler('Mozilla/5.0', 'Page Preview'), false)
  assert.equal(isIndexingCrawler(null), false)
})
