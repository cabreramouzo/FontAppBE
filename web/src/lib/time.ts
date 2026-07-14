/** Tiempo relativo en español: "ayer", "hace 3 h", etc. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const s = Math.floor((Date.now() - then) / 1000)
  if (s < 60) return 'hace un momento'
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(iso).toLocaleDateString()
}
