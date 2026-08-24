export type MainSection = 'map' | 'activity' | 'zones' | 'profile'

/** Sección principal a la que pertenece cada ruta, también en pantallas secundarias. */
export function mainSection(pathname: string): MainSection | null {
  if (pathname === '/' || pathname.startsWith('/fonts/')) return 'map'
  if (pathname.startsWith('/activity')) return 'activity'
  if (pathname.startsWith('/zones')) return 'zones'
  if (
    pathname.startsWith('/me') ||
    pathname.startsWith('/gamification') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset')
  ) return 'profile'
  return null
}
