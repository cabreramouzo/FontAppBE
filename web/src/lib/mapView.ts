export type SavedMapView = { lat: number; lng: number; zoom: number }

/**
 * Lee una vista persistida sin dejar que datos antiguos o manipulados lleguen a
 * Leaflet. `JSON.parse` correcto no implica coordenadas válidas: `{}` también es JSON
 * y termina en `Invalid LatLng object`, tumbando únicamente la pantalla del mapa.
 */
export function parseSavedMapView(raw: string | null): SavedMapView | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<SavedMapView> | null
    if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lng)
      || !Number.isFinite(value.zoom)) return null
    const lat = value.lat as number
    const lng = value.lng as number
    const zoom = value.zoom as number
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || zoom < 1 || zoom > 22) return null
    return { lat, lng, zoom }
  } catch {
    return null
  }
}

/**
 * Qué mapa se pinta al abrir, y si eso desactiva la ubicación automática.
 *
 * Son **dos preguntas distintas** y ahí está la trampa. La vista de la sesión es estado de
 * navegación: existe porque venías del detalle de una fuente o de una búsqueda, así que
 * ubicarte automáticamente desharía lo que acabas de pedir. La última vista conocida es
 * solo un respaldo para no abrir en el centro por defecto, y **no dice nada** sobre tu
 * intención de ahora.
 *
 * Si el respaldo contara como «venías de otro sitio», la ubicación automática dejaría de
 * ejecutarse para siempre después de la primera visita — y sin ningún error.
 *
 * Vive aquí y no en `MapPage` para poder probarlo: son dos cadenas de `Storage` y una
 * decisión, y el fallo es silencioso en las dos direcciones.
 */
export function vistaAlAbrir(sesion: string | null, ultima: string | null): {
  vista: SavedMapView | null
  veniaDeOtroSitio: boolean
} {
  const deSesion = parseSavedMapView(sesion)
  return {
    vista: deSesion ?? parseSavedMapView(ultima),
    veniaDeOtroSitio: deSesion !== null,
  }
}

/**
 * Where the map opens for someone we know nothing about yet: no saved view, no location
 * permission. It used to be Madrid at zoom 5 for everybody, so a viewer in Mexico City
 * arriving from a video landed on another continent and saw no fountain of theirs.
 *
 * Guessed from the device **time zone**, which the browser gives without a permission
 * prompt, a network call or any server-side geo-IP — nothing leaves the device. It says
 * the country far more reliably than the language (Spanish is spoken in twenty of them)
 * and is only a starting point: the automatic location and any saved view still win.
 * Unknown zones fall back to the old Madrid view.
 */
type View = { lat: number; lng: number; zoom: number }
const v = (lat: number, lng: number, zoom: number): View => ({ lat, lng, zoom })

export const DEFAULT_VIEW: View = v(40.4168, -3.7038, 5)

const BY_ZONE: Record<string, View> = {
  'America/Mexico_City': v(23.6, -102.5, 5), 'America/Santiago': v(-35, -71, 5),
  'America/Lima': v(-9.2, -75, 5), 'America/Guayaquil': v(-1.8, -78.2, 6),
  'America/Bogota': v(4.6, -74.3, 5), 'America/La_Paz': v(-16.3, -63.6, 5),
  'America/Montevideo': v(-32.5, -55.8, 6), 'America/Asuncion': v(-23.4, -58.4, 6),
  'America/Caracas': v(6.4, -66.6, 5), 'America/Havana': v(21.5, -79.5, 6),
  'America/Costa_Rica': v(9.7, -84, 7), 'America/Panama': v(8.5, -80.8, 7),
  'America/Managua': v(12.9, -85.2, 7), 'America/Guatemala': v(15.8, -90.2, 7),
  'America/Tegucigalpa': v(15.2, -86.2, 7), 'America/El_Salvador': v(13.8, -88.9, 8),
  'America/Santo_Domingo': v(18.7, -70.2, 7), 'America/Puerto_Rico': v(18.2, -66.5, 8),
  'Europe/Rome': v(42.5, 12.5, 5), 'Europe/Paris': v(46.6, 2.2, 5),
  'Europe/Lisbon': v(39.6, -8, 6), 'Europe/Zurich': v(46.8, 8.2, 7),
  'Europe/Stockholm': v(62, 15, 4), 'Europe/Helsinki': v(64, 26, 4),
  'Europe/London': v(54.5, -3, 5), 'Europe/Dublin': v(53.4, -8, 6),
  'Europe/Berlin': v(51.2, 10.4, 6), 'Europe/Budapest': v(47.2, 19.4, 7),
  'Europe/Vienna': v(47.6, 14.1, 7), 'Europe/Athens': v(38.6, 23.5, 6),
  'Europe/Prague': v(49.8, 15.5, 7), 'Europe/Podgorica': v(42.7, 19.3, 8),
  'Europe/Amsterdam': v(52.2, 5.3, 7), 'Europe/Warsaw': v(52, 19.1, 6),
  'Europe/Ljubljana': v(46.1, 14.8, 8), 'Europe/Zagreb': v(45.1, 15.2, 7),
  'Europe/Sarajevo': v(44, 17.8, 7), 'Europe/Brussels': v(50.6, 4.6, 8),
  'Europe/Tirane': v(41.2, 20.1, 8), 'Europe/Busingen': v(51.2, 10.4, 6),
  'Asia/Tokyo': v(36.5, 138, 5), 'Europe/Sofia': v(42.7, 25.3, 7),
  'Europe/Bratislava': v(48.7, 19.7, 7), 'Europe/Bucharest': v(45.9, 25, 6),
  'Europe/Belgrade': v(44, 20.9, 7), 'Europe/Copenhagen': v(56, 10.5, 6),
  'Europe/Skopje': v(41.6, 21.7, 8), 'Asia/Nicosia': v(35, 33.2, 8),
  'Asia/Famagusta': v(35, 33.2, 8), 'Europe/Riga': v(56.9, 24.6, 7),
  'Europe/Vilnius': v(55.2, 23.9, 7), 'Europe/Tallinn': v(58.7, 25, 7),
  'Europe/Luxembourg': v(49.8, 6.1, 9), 'Atlantic/Reykjavik': v(64.9, -18.6, 6),
  'Europe/Vaduz': v(47.15, 9.55, 11), 'Europe/San_Marino': v(43.94, 12.46, 12),
  'Europe/Monaco': v(43.74, 7.42, 14), 'Europe/Malta': v(35.9, 14.4, 10),
  'Europe/Oslo': v(62, 10, 4), 'Arctic/Longyearbyen': v(62, 10, 4),
  'Europe/Andorra': v(42.5, 1.55, 10),
}
const MEXICO = BY_ZONE['America/Mexico_City']
const BRAZIL = v(-14.2, -51.9, 4)
const ARGENTINA = v(-38.4, -63.6, 4)
const MEXICAN = ['Cancun', 'Merida', 'Monterrey', 'Matamoros', 'Chihuahua', 'Ciudad_Juarez',
  'Ojinaga', 'Mazatlan', 'Bahia_Banderas', 'Hermosillo', 'Tijuana']
const BRAZILIAN = ['Sao_Paulo', 'Bahia', 'Fortaleza', 'Recife', 'Belem', 'Manaus', 'Cuiaba',
  'Campo_Grande', 'Porto_Velho', 'Boa_Vista', 'Rio_Branco', 'Araguaina', 'Maceio',
  'Santarem', 'Noronha', 'Eirunepe']

export function defaultViewFor(timeZone: string | undefined): View {
  if (!timeZone) return DEFAULT_VIEW
  if (BY_ZONE[timeZone]) return BY_ZONE[timeZone]
  if (timeZone === 'America/Punta_Arenas') return BY_ZONE['America/Santiago']
  if (timeZone.startsWith('America/Argentina/') || timeZone === 'America/Buenos_Aires') return ARGENTINA
  const city = timeZone.startsWith('America/') ? timeZone.slice(8) : ''
  if (MEXICAN.includes(city)) return MEXICO
  if (BRAZILIAN.includes(city)) return BRAZIL
  return DEFAULT_VIEW
}

/** The device's time zone, or `undefined` if the browser will not say. */
export function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined }
}
