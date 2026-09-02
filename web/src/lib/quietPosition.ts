/**
 * Posición del usuario **sin pedir permiso**: solo la devuelve si el navegador ya lo
 * tenía concedido.
 *
 * La regla es la misma que sigue el mapa al abrirse: nunca lanzar el diálogo del
 * navegador a bocajarro, porque quien lo recibe sin haber pedido nada lo deniega, y
 * denegado se queda. Cuando el usuario pide explícitamente "cerca de mí", entonces sí
 * se le puede preguntar — eso lo hace quien llama, desde su gesto.
 */

/** Why a location request failed, for the caller to report or branch on. */
export type GeoFailReason = 'denied' | 'unavailable'

/**
 * getCurrentPosition with an iPad-friendly retry.
 *
 * On a WiFi-only iPad (no GPS) the first fix often fails with POSITION_UNAVAILABLE or
 * TIMEOUT **even when permission was just granted** — which is why it never reproduces on a
 * phone with GPS. It surfaced as a red "couldn't locate" from the map after the user
 * accepted the consent. So a first, fresh-ish attempt; and if it fails for anything other
 * than a denial, a second one that accepts *any* cached fix (`maximumAge: Infinity`) with a
 * longer timeout. This is exactly the two-step the map already does, factored out.
 */
function getPosition(onFail?: (reason: GeoFailReason) => void): Promise<[number, number] | null> {
  if (!navigator.geolocation || !window.isSecureContext) { onFail?.('unavailable'); return Promise.resolve(null) }
  const once = (opts: PositionOptions) =>
    new Promise<[number, number] | GeolocationPositionError>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.latitude, p.coords.longitude]),
        (err) => resolve(err),
        opts,
      )
    })
  return (async () => {
    let r = await once({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 })
    if (Array.isArray(r)) return r
    // A denial is the user's call — no point retrying, and don't report it as "unavailable".
    if (r.code === r.PERMISSION_DENIED) { onFail?.('denied'); return null }
    r = await once({ enableHighAccuracy: false, timeout: 15_000, maximumAge: Infinity })
    if (Array.isArray(r)) return r
    onFail?.(r.code === r.PERMISSION_DENIED ? 'denied' : 'unavailable')
    return null
  })()
}

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
  return getPosition()
}

/**
 * Pide la posición aunque haya que mostrar el diálogo. Solo desde un gesto del usuario.
 *
 * `onFail` es opcional: quien quiera medir por qué falló (permiso denegado vs. no se pudo
 * ubicar, que en iPad es lo común) lo pasa; el resto sigue recibiendo `null` como antes.
 */
export async function askPosition(onFail?: (reason: GeoFailReason) => void): Promise<[number, number] | null> {
  if (!navigator.geolocation || !window.isSecureContext) { onFail?.('unavailable'); return null }
  return getPosition(onFail)
}
