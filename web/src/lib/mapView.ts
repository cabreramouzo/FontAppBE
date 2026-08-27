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
