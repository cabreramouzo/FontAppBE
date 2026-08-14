/**
 * Posición del usuario **sin pedir permiso**: solo la devuelve si el navegador ya lo
 * tenía concedido.
 *
 * La regla es la misma que sigue el mapa al abrirse: nunca lanzar el diálogo del
 * navegador a bocajarro, porque quien lo recibe sin haber pedido nada lo deniega, y
 * denegado se queda. Cuando el usuario pide explícitamente "cerca de mí", entonces sí
 * se le puede preguntar — eso lo hace quien llama, desde su gesto.
 */
export async function positionIfAllowed(): Promise<[number, number] | null> {
  if (!navigator.geolocation || !window.isSecureContext) return null
  try {
    const estado = await navigator.permissions?.query({ name: 'geolocation' })
    if (estado?.state !== 'granted') return null
  } catch {
    // Safari antiguo no tiene Permissions API: sin poder comprobarlo, no arriesgamos
    // a disparar el diálogo.
    return null
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      () => resolve(null),
      // Vale una lectura de hasta cinco minutos: esto sitúa una lista, no guía a nadie.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

/** Pide la posición aunque haya que mostrar el diálogo. Solo desde un gesto del usuario. */
export async function askPosition(): Promise<[number, number] | null> {
  if (!navigator.geolocation || !window.isSecureContext) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    )
  })
}
