import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n/I18nContext'

/**
 * "What does each button do?" overlay for the map.
 *
 * Every map control that should be explained carries `data-map-help="<key>"`; this
 * overlay finds them in the DOM, cuts a hole around each one in a dark backdrop and
 * puts its label next to it. There are no steps: it is one screen, opened on purpose
 * from the (?) button, and any tap or Escape closes it.
 *
 * Why it can work where the August 2026 contextual popovers did not: those pointed at a
 * map pin, which is not always on screen (heat map, clusters, detail still loading). The
 * targets here are the FIXED map controls, which exist whenever the map does. A control
 * that is not rendered or has no size (the zoom buttons on phones) is simply skipped, so a
 * missing target never produces a label pointing at nothing.
 *
 * Positions are measured when the overlay opens and again on resize/orientation change,
 * never cached: the controls move with the notice strip (`--alto-avisos`) and change
 * layout between phone and desktop.
 *
 * Rendered into `document.body` through a portal for the same reason as the photo
 * lightbox: any ancestor with `sticky`, `transform` or `opacity` creates a stacking
 * context, and inside it no z-index is enough to cover the rest of the page.
 */

const PAD = 6          // gap between the control and the edge of its highlight hole
const GAP = 12         // gap between the highlight and its label
const LABEL_MAX = 220  // label max width, px

type Target = { key: string; rect: DOMRect }

/** Round buttons get a round hole; anything taller (the search pill on desktop, the zoom
 * pair) gets soft corners instead of a stretched capsule. */
const holeRadius = (r: DOMRect) => (r.height <= 60 ? r.height / 2 + PAD : 12)

function measure(): Target[] {
  const seen = new Set<string>()
  const out: Target[] = []
  document.querySelectorAll<HTMLElement>('[data-map-help]').forEach((el) => {
    const key = el.dataset.mapHelp
    if (!key || seen.has(key)) return
    const rect = el.getBoundingClientRect()
    // Hidden (display:none gives a 0×0 rect) or off screen: nothing to point at.
    if (rect.width < 1 || rect.height < 1) return
    if (rect.bottom < 0 || rect.top > window.innerHeight) return
    seen.add(key)
    out.push({ key, rect })
  })
  return out
}

type Box = { x: number; y: number; w: number; h: number }
type Placed = Box & { align: 'left' | 'right' | 'center' }

const overlaps = (a: Box, b: Box, m = 4) =>
  a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m

/**
 * Where each label goes. Tries, in order: beside the control on the side with more room,
 * below it, above it, and the other side — and takes the first spot that fits on screen
 * and touches neither another label nor another highlighted control. With a fixed "always
 * beside" rule, on a 375 px phone the search label (left edge) and the filters label (right
 * edge) met in the middle of the same row, and the legend's and the add button's collided
 * at the bottom. Needs the real label sizes, so it runs after a first hidden measuring pass.
 */
function placeLabels(targets: Target[], sizes: Record<string, { w: number; h: number }>, vw: number, vh: number): Record<string, Placed> {
  const holes: Box[] = targets.map(({ rect: r }) => ({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }))
  // The centred title is an obstacle too.
  const taken: Box[] = [{ x: vw / 2 - 140, y: vh / 2 - 30, w: 280, h: 60 }]
  const out: Record<string, Placed> = {}
  const area = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  // Controls hugging the right edge go first: they have the least room (only their left
  // side). Placed in page order, the search button took the top row and pushed the
  // filters label up into the header.
  const order = targets.map((tg, i) => ({ tg, i }))
    .sort((p, q) => (q.tg.rect.left + q.tg.rect.width / 2) - (p.tg.rect.left + p.tg.rect.width / 2))
  for (const { tg: { key, rect: r }, i } of order) {
    const size = sizes[key]
    if (!size) continue
    const { w, h } = size
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const clampX = (x: number) => Math.max(8, Math.min(vw - 8 - w, x))
    const clampY = (y: number) => Math.max(8, Math.min(vh - 8 - h, y))
    const left: Placed = { x: r.left - PAD - GAP - w, y: cy - h / 2, w, h, align: 'right' }
    const right: Placed = { x: r.right + PAD + GAP, y: cy - h / 2, w, h, align: 'left' }
    const below: Placed = { x: clampX(cx - w / 2), y: r.bottom + PAD + GAP, w, h, align: 'center' }
    const above: Placed = { x: clampX(cx - w / 2), y: r.top - PAD - GAP - h, w, h, align: 'center' }
    const sideFirst = r.left > vw - r.right ? [left, right] : [right, left]
    const bases = [sideFirst[0], below, above, sideFirst[1]]
    const others = holes.filter((_, j) => j !== i)
    const fits = (c: Box) =>
      c.x >= 8 && c.x + c.w <= vw - 8 && c.y >= 8 && c.y + c.h <= vh - 8 &&
      !taken.some((o) => overlaps(c, o)) && !others.some((o) => overlaps(c, o, 2))
    // Each spot, then the same spot nudged a little up or down: a label a few pixels off
    // its control still reads as its own, and it saves many dead ends in a crowded corner.
    const nudges = [0, -14, 14, -28, 28, -42, 42]
    let chosen: Placed | undefined
    for (const base of bases) {
      for (const d of nudges) {
        const c = { ...base, y: base.y + d }
        if (fits(c)) { chosen = c; break }
      }
      if (chosen) break
    }
    // Nothing is clean: take the spot that covers the least, but ALWAYS on screen — a
    // label cut off by the edge of the phone is worse than one touching a neighbour.
    if (!chosen) {
      const cost = (c: Box) => [...taken, ...others].reduce((sum, o) => sum + area(c, o), 0)
      chosen = bases
        .map((c) => ({ ...c, x: clampX(c.x), y: clampY(c.y) }))
        .reduce((best, c) => (cost(c) < cost(best) ? c : best))
    }
    taken.push(chosen)
    out[key] = chosen
  }
  return out
}

export function MapHelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [targets, setTargets] = useState<Target[]>([])
  const [vw, setVw] = useState(() => window.innerWidth)
  const [vh, setVh] = useState(() => window.innerHeight)
  // Label sizes from the hidden measuring pass; null means "measure first".
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }> | null>(null)
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const remeasure = useCallback(() => {
    setVw(window.innerWidth)
    setVh(window.innerHeight)
    setTargets(measure())
    setSizes(null)
  }, [])

  // Measure before paint so the first frame already has its holes in place.
  useLayoutEffect(() => { if (open) remeasure() }, [open, remeasure])

  // Second half of the layout: once the labels are in the DOM (hidden), read their size.
  useLayoutEffect(() => {
    if (!open || sizes !== null) return
    const next: Record<string, { w: number; h: number }> = {}
    for (const { key } of targets) {
      const el = labelRefs.current[key]
      if (el) next[key] = { w: el.offsetWidth, h: el.offsetHeight }
    }
    setSizes(next)
  }, [open, sizes, targets])

  const placed = sizes ? placeLabels(targets, sizes, vw, vh) : null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', remeasure)
    window.addEventListener('orientationchange', remeasure)
    // Opened from the ⋮ menu (`/?help=1`) the map may still be mounting: react-leaflet
    // renders its children (the zoom buttons) one render after the map exists. Measure
    // once more shortly after, or those controls would be left out.
    const late = window.setTimeout(remeasure, 300)
    return () => {
      window.clearTimeout(late)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('orientationchange', remeasure)
    }
  }, [open, onClose, remeasure])

  if (!open) return null

  return createPortal(
    <div
      className="map-help"
      role="dialog"
      aria-modal="true"
      aria-label={t('mapHelp.title')}
      onClick={onClose}
    >
      <svg className="map-help__backdrop" aria-hidden width="100%" height="100%">
        <defs>
          <mask id="map-help-holes">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targets.map(({ key, rect: r }) => (
              <rect
                key={key}
                x={r.left - PAD} y={r.top - PAD}
                width={r.width + PAD * 2} height={r.height + PAD * 2}
                rx={holeRadius(r)}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#map-help-holes)" />
        {targets.map(({ key, rect: r }) => (
          <rect
            key={key}
            className="map-help__ring"
            x={r.left - PAD} y={r.top - PAD}
            width={r.width + PAD * 2} height={r.height + PAD * 2}
            rx={holeRadius(r)}
          />
        ))}
      </svg>

      {targets.map(({ key }) => {
        const p = placed?.[key]
        return (
          <div
            key={key}
            ref={(el) => { labelRefs.current[key] = el }}
            className="map-help__label"
            // Measuring pass: laid out at its natural width but invisible and out of the way.
            style={p
              ? { left: p.x, top: p.y, width: p.w, textAlign: p.align }
              : { left: 0, top: 0, maxWidth: LABEL_MAX, visibility: 'hidden' }}
          >
            {t(`mapHelp.${key}`)}
          </div>
        )
      })}

      <div className="map-help__footer">
        <strong>{t('mapHelp.title')}</strong>
        <span>{t('mapHelp.close')}</span>
      </div>
    </div>,
    document.body,
  )
}
