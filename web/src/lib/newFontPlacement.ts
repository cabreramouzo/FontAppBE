export const NEARBY_PLACEMENT_METRES = 250

export type Coordinates = { lat: number; lng: number }

function radians(value: number) { return value * Math.PI / 180 }

export function distanceMetres(a: Coordinates, b: Coordinates): number {
  const earth = 6_371_000
  const dLat = radians(b.lat - a.lat)
  const dLng = radians(b.lng - a.lng)
  const lat1 = radians(a.lat)
  const lat2 = radians(b.lat)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * El mapa expresa la intención de la persona: si está mirando lejos de su GPS,
 * "añadir" significa el punto visible, no devolverla silenciosamente a donde está.
 */
export function newFontPosition(mapCenter: Coordinates, me: Coordinates | null): Coordinates {
  if (!me || distanceMetres(mapCenter, me) > NEARBY_PLACEMENT_METRES) return mapCenter
  return me
}

export function isRemotePlacement(position: Coordinates, me: Coordinates | null): boolean {
  return me !== null && distanceMetres(position, me) > NEARBY_PLACEMENT_METRES
}
