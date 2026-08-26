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
