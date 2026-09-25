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
}

/**
 * The territory's name, or `null` when we only have the code. Most admin1 codes (all of
 * Latin America, Portugal, Chile…) map one-to-one to the region already shown, so there is
 * no extra name to say — and printing «MX-JAL» next to «Jalisco» would be worse than nothing.
 */
export function admin1Name(code: string): string | null {
  return NAMES[code] ?? null
}
