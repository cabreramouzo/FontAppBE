/** Nombres territoriales para los admin1 que agrupan más de una demarcación actual. */
const NAMES: Record<string, string> = {
  'ES-AN': 'Andalucía', 'ES-AR': 'Aragón', 'ES-AS': 'Asturias',
  'ES-CB': 'Cantabria', 'ES-CL': 'Castilla y León', 'ES-CM': 'Castilla-La Mancha',
  'ES-CN': 'Canarias', 'ES-CT': 'Catalunya', 'ES-EX': 'Extremadura',
  'ES-GA': 'Galicia', 'ES-IB': 'Illes Balears', 'ES-MC': 'Región de Murcia',
  'ES-MD': 'Comunidad de Madrid', 'ES-NC': 'Navarra', 'ES-PV': 'Euskadi',
  'ES-RI': 'La Rioja', 'ES-VC': 'Comunitat Valenciana', 'ES-CE': 'Ceuta', 'ES-ML': 'Melilla',
  'FR-ARA': 'Auvergne-Rhône-Alpes', 'FR-NAQ': 'Nouvelle-Aquitaine',
  'FR-OCC': 'Occitanie', 'FR-PAC': 'Provence-Alpes-Côte d’Azur',
  'IT-21': 'Piemonte', 'IT-23': 'Valle d’Aosta', 'IT-25': 'Lombardia',
  'IT-32': 'Trentino-Alto Adige', 'IT-34': 'Veneto', 'IT-36': 'Friuli-Venezia Giulia',
  'IT-42': 'Liguria', 'IT-45': 'Emilia-Romagna', 'IT-52': 'Toscana', 'IT-55': 'Umbria',
  'IT-57': 'Marche', 'IT-62': 'Lazio', 'IT-65': 'Abruzzo', 'IT-67': 'Molise',
  'IT-72': 'Campania', 'IT-75': 'Puglia', 'IT-77': 'Basilicata', 'IT-78': 'Calabria',
  'IT-82': 'Sicilia', 'IT-88': 'Sardegna',
}

/**
 * The territory's name, or `null` when we only have the code. Most admin1 codes (all of
 * Latin America, Portugal, Chile…) map one-to-one to the region already shown, so there is
 * no extra name to say — and printing «MX-JAL» next to «Jalisco» would be worse than nothing.
 */
export function admin1Name(code: string): string | null {
  return NAMES[code] ?? null
}
