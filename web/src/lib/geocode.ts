// Búsqueda de lugares (geocoding) con Nominatim de OpenStreetMap — coherente con
// que el mapa y los datos ya son de OSM. Uso ligero y con debounce (política de uso
// de Nominatim: máx. ~1 req/s). Devuelve el bounding box para encuadrar el mapa.

export interface Place {
  name: string
  lat: number
  lon: number
  /** [sur, norte, oeste, este] si Nominatim lo aporta. */
  bbox?: [number, number, number, number]
}

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
  boundingbox?: [string, string, string, string]
}

export async function searchPlaces(q: string, lang: string, signal?: AbortSignal): Promise<Place[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5` +
    `&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const data = (await res.json()) as NominatimResult[]
    return data.map((d) => ({
      name: d.display_name,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      bbox: d.boundingbox
        ? [
            parseFloat(d.boundingbox[0]),
            parseFloat(d.boundingbox[1]),
            parseFloat(d.boundingbox[2]),
            parseFloat(d.boundingbox[3]),
          ]
        : undefined,
    }))
  } catch {
    return [] // red caída o petición abortada: sin resultados de lugar
  }
}
