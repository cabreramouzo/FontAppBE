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

export function admin1Name(code: string): string {
  return NAMES[code] ?? code
}
