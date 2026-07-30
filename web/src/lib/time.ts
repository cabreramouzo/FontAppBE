type Translate = (key: string, params?: Record<string, string | number>) => string

/** Tiempo relativo localizado: "ahir", "fa 3 h", etc. Recibe la función `t` de i18n. */
export function timeAgo(iso: string, t: Translate): string {
  const then = new Date(iso).getTime()
  const s = Math.floor((Date.now() - then) / 1000)
  if (s < 60) return t('time.moment')
  const m = Math.floor(s / 60)
  if (m < 60) return t('time.min', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('time.hour', { n: h })
  const days = Math.floor(h / 24)
  if (days === 1) return t('time.yesterday')
  if (days < 30) return t('time.days', { n: days })
  return new Date(iso).toLocaleDateString()
}

/** ¿El estado es demasiado antiguo para fiarse? (por defecto, > 30 días). */
export function isStale(iso: string, days = 30): boolean {
  return Date.now() - new Date(iso).getTime() > days * 24 * 3600 * 1000
}
