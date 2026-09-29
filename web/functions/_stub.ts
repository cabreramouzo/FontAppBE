// Kept apart from _crawl.ts: that module is imported by Node tests, where HTMLRewriter
// does not exist.

/** The generic page, `noindex` and without scripts: nothing in it can call the API. */
export function crawlerStub(page: Response): Response {
  // Without scripts too. Applebot renders JavaScript like Safari: with the app still in
  // the page, React booted and asked the API directly on fly.dev — so the gate saved the
  // Function's call and not Neon's. Measured 26/09/2026 on fountain pages.
  return new HTMLRewriter()
    .on('head', { element: (e) => { e.append('<meta name="robots" content="noindex">', { html: true }) } })
    .on('script', { element: (e) => { e.remove() } })
    .on('link[rel="modulepreload"]', { element: (e) => { e.remove() } })
    .transform(page)
}
