import { esStandalone } from './install'

/**
 * The tab bar sitting too high on a cold start of the installed app on iPhone, until
 * another tab is tapped (see CLAUDE.md, «El hueco de la tab bar en iOS»).
 *
 * A WebKit fault, not ours: launching a home-screen app, iOS lays the page out while the
 * launch animation is still running, against a window height that is not the final one,
 * and positions everything `position: fixed; bottom: 0` against it. Nothing moves them
 * again until something forces a relayout — which is exactly what changing tab does, by
 * replacing the content and its height. Safari tabs do not launch from an icon, so they
 * never show it.
 *
 * So we force that relayout ourselves: grow the body by a pixel and put it back, a few
 * times during the first second (the animation's length is not something we can read)
 * and again whenever the app comes back to the foreground. It lasts a frame; nothing is
 * visible. Only in the installed app on iOS: elsewhere there is nothing to fix.
 */
export function nudgeLayoutOnLaunch(): void {
  if (typeof window === 'undefined' || !esIOSStandalone()) return
  const nudge = () => {
    const body = document.body
    if (!body) return
    const before = body.style.minHeight
    body.style.minHeight = 'calc(100% + 1px)'
    void body.offsetHeight // force the layout with the extra pixel
    body.style.minHeight = before
    void body.offsetHeight
  }
  // setTimeout and not requestAnimationFrame: frames are frozen while the launch
  // animation or a hidden page is in progress, and this has to happen regardless.
  const burst = () => { for (const ms of [0, 300, 1000]) window.setTimeout(nudge, ms) }
  burst()
  window.addEventListener('pageshow', burst)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') burst() })
  window.addEventListener('orientationchange', burst)
}

function esIOSStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && (nav.standalone === true || esStandalone())
}
